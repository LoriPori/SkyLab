#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Skylab · gfs_tiles.py
NOAA/NCEP GFS 0,25° (análise, f000) → tiles binários compactos → Supabase Storage

Corre no GitHub Actions (.github/workflows/gfs-tiles.yml), de 6 em 6 horas.
  1. procura o ciclo GFS mais recente já publicado (bucket público noaa-gfs-bdp-pds, sem chave);
  2. descarrega SÓ os 4 campos de que precisamos (vento 10 m u/v, temperatura 2 m, pressão ao nível do mar)
     com pedidos de byte-range guiados pelo ficheiro .idx (alguns MB em vez de ~500 MB);
  3. descodifica com pygrib, converte unidades, põe a grelha sul→norte e lon 0→359,75;
  4. quantiza para uint16 + delta por linha + gzip, verifica a descodificação, e envia para o Supabase Storage
     (bucket público; só usa a API REST, sem bibliotecas extra).

Formato de cada ficheiro (antes do gzip): planos de 1440×721 uint16 little-endian, linha a linha (sul→norte),
cada linha em delta: d[0]=q[0], d[i]=(q[i]-q[i-1]) mod 65536. Valor real = q/sc - off.
  wind.bin  2 planos (u, v em m/s)   off=128  sc=100
  temp.bin  1 plano  (°C)            off=100  sc=100
  pmsl.bin  1 plano  (hPa)           off=-800 sc=100

Variáveis de ambiente:
  SUPABASE_URL          https://<projeto>.supabase.co
  SUPABASE_SERVICE_KEY  chave service_role (só nos secrets do GitHub, nunca no site!)
  SUPABASE_BUCKET       opcional, por omissão "gfs"
  FORCE=1     reenvia mesmo que o ciclo já esteja guardado
  OUT_DIR=…   modo local: grava em disco em vez de enviar (para testar sem credenciais)
"""
import gzip
import json
import os
import sys
import tempfile
import time
import datetime as dt
import urllib.error
import urllib.request

import numpy as np

W, H, ST = 1440, 721, 0.25
NOAA = "https://noaa-gfs-bdp-pds.s3.amazonaws.com"
UA = "SkyLab-tiles/1.0 (+https://loripori.github.io/SkyLab)"
KEEP_RUNS = 3

# (variável, nível) do .idx  →  nome interno
WANT = {
    ("UGRD", "10 m above ground"): "u",
    ("VGRD", "10 m above ground"): "v",
    ("TMP", "2 m above ground"): "t",
    ("PRMSL", "mean sea level"): "p",
}
FIELDS = {
    "wind": dict(file="wind.bin", planes=2, off=128.0, sc=100.0),
    "temp": dict(file="temp.bin", planes=1, off=100.0, sc=100.0),
    "pmsl": dict(file="pmsl.bin", planes=1, off=-800.0, sc=100.0),
}


def log(*a):
    print("[gfs]", *a, flush=True)


# ───────────────────────── rede ─────────────────────────
def http(url, rng=None, tries=4):
    last = None
    for n in range(tries):
        try:
            h = {"User-Agent": UA}
            if rng:
                h["Range"] = rng
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=90) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):      # o S3 público devolve 403 para chaves que não existem
                raise
            last = e
        except Exception as e:            # noqa: BLE001
            last = e
        time.sleep(2 * (n + 1))
    raise last


def cycle_urls(c):
    ymd, hh = c.strftime("%Y%m%d"), c.strftime("%H")
    base = f"{NOAA}/gfs.{ymd}/{hh}/atmos/gfs.t{hh}z.pgrb2.0p25.f000"
    return base, base + ".idx"


def parse_idx(txt):
    rows = []
    for line in txt.splitlines():
        p = line.split(":")
        if len(p) >= 6:
            rows.append((int(p[1]), p[3], p[4], p[5]))
    out = {}
    for i, (off, var, lev, ft) in enumerate(rows):
        k = WANT.get((var, lev))
        if k and ft.startswith("anl") and k not in out:
            end = rows[i + 1][0] - 1 if i + 1 < len(rows) else None
            out[k] = (off, end)
    miss = [k for k in "uvtp" if k not in out]
    if miss:
        raise RuntimeError(f"campos em falta no .idx: {miss}")
    return out


def find_cycle(now):
    base = (now - dt.timedelta(hours=3, minutes=30)).replace(minute=0, second=0, microsecond=0)
    base = base.replace(hour=base.hour - base.hour % 6)
    for n in range(6):                                   # o ciclo só aparece ~3,5–5 h depois da hora nominal
        c = base - dt.timedelta(hours=6 * n)
        grib, idx = cycle_urls(c)
        try:
            return c, grib, parse_idx(http(idx).decode("utf-8", "replace"))
        except urllib.error.HTTPError:
            log("ciclo", c.strftime("%Y%m%d %HZ"), "ainda não publicado")
        except RuntimeError as e:
            log("ciclo", c.strftime("%Y%m%d %HZ"), str(e))
    raise SystemExit("nenhum ciclo GFS disponível")


# ───────────────────────── descodificação ─────────────────────────
def to_grid(msg):
    """Mensagem GRIB → array float64 (H, W): linha 0 = 90°S, coluna 0 = 0°E."""
    a = np.ma.filled(msg.values.astype("float64"), np.nan)
    if a.shape != (H, W):
        raise RuntimeError(f"grelha inesperada {a.shape}, esperava {(H, W)}")
    if int(msg["jScansPositively"]) == 0:                # GFS vem norte→sul; queremos sul→norte
        a = a[::-1]
    lon1 = float(msg["longitudeOfFirstGridPointInDegrees"])
    sh = int(round(((0.0 - lon1) % 360.0) / ST)) % W
    if sh:
        a = np.roll(a, -sh, axis=1)
    bad = int(np.isnan(a).sum())
    if bad:
        if bad > W * H * 0.001:
            raise RuntimeError(f"{bad} valores em falta")
        m = np.nanmean(a, axis=1, keepdims=True)
        a = np.where(np.isnan(a), m, a)
    return a


def read_fields(grib_url, ranges):
    import pygrib
    fd, path = tempfile.mkstemp(suffix=".grb2")
    os.close(fd)
    order = []
    try:
        with open(path, "wb") as f:
            for k, (a, b) in ranges.items():
                rng = f"bytes={a}-{b}" if b is not None else f"bytes={a}-"
                f.write(http(grib_url, rng))
                order.append(k)
        out = {}
        g = pygrib.open(path)
        for k, msg in zip(order, g):
            out[k] = to_grid(msg)
        g.close()
        if len(out) != 4:
            raise RuntimeError("mensagens GRIB a menos")
        return out
    finally:
        os.unlink(path)


# ───────────────────────── codificação ─────────────────────────
def quant(a, off, sc):
    q = np.rint((a + off) * sc)
    if q.min() < 0 or q.max() > 65535:
        raise RuntimeError(f"valores fora da gama de quantização ({a.min():.2f}…{a.max():.2f})")
    return q.astype(np.uint16)


def delta_rows(q):
    d = q.copy()
    d[:, 1:] = ((q[:, 1:].astype(np.int32) - q[:, :-1].astype(np.int32)) & 0xFFFF).astype(np.uint16)
    return d


def encode(planes, off, sc):
    raw = b"".join(delta_rows(quant(p, off, sc)).astype("<u2").tobytes() for p in planes)
    return gzip.compress(raw, compresslevel=9, mtime=0)


def decode(gz, n_planes, off, sc):
    q = np.frombuffer(gzip.decompress(gz), dtype="<u2").reshape(n_planes, H, W).astype(np.uint64)
    return [((np.cumsum(q[k], axis=1) & 0xFFFF).astype(np.float64) / sc) - off for k in range(n_planes)]


def sanity(u, v, t, p):
    sp = np.hypot(u, v)
    checks = [
        (sp.max() < 150, f"vento máx {sp.max():.1f} m/s"),
        (sp.mean() > 1.5, f"vento médio {sp.mean():.2f} m/s"),
        (-95 < t.min() and t.max() < 65, f"temperatura {t.min():.1f}…{t.max():.1f} °C"),
        (-30 < t.mean() < 30, f"temperatura média {t.mean():.1f} °C"),
        (850 < p.min() and p.max() < 1090, f"pressão {p.min():.1f}…{p.max():.1f} hPa"),
        (990 < p.mean() < 1030, f"pressão média {p.mean():.1f} hPa"),
    ]
    for ok, txt in checks:
        log(("ok  " if ok else "ERRO"), txt)
    if not all(ok for ok, _ in checks):
        raise RuntimeError("verificação de sanidade falhou: não publico estes dados")


def build(fields, run_dt):
    u, v = fields["u"], fields["v"]
    t, p = fields["t"] - 273.15, fields["p"] / 100.0
    sanity(u, v, t, p)
    src = {"wind": [u, v], "temp": [t], "pmsl": [p]}
    files = {}
    for name, d in FIELDS.items():
        gz = encode(src[name], d["off"], d["sc"])
        back = decode(gz, d["planes"], d["off"], d["sc"])
        err = max(float(np.abs(b - o).max()) for b, o in zip(back, src[name]))
        if err > 0.6 / d["sc"]:
            raise RuntimeError(f"{name}: erro de ida-e-volta {err} > {0.6 / d['sc']}")
        files[name] = gz
        log(f"{name}: {len(gz) / 1024:.0f} KB (erro máx {err:.5f})")
    run = run_dt.strftime("%Y%m%d%H")
    man = {
        "v": 1, "run": run, "ts": int(run_dt.replace(tzinfo=dt.timezone.utc).timestamp() * 1000),
        "issued": int(time.time() * 1000), "w": W, "h": H, "st": ST, "lat0": -90, "lon0": 0,
        "src": "NOAA/NCEP GFS 0.25°",
    }
    for name, d in FIELDS.items():
        man[name] = {"f": d["file"], "planes": d["planes"], "off": d["off"], "sc": d["sc"]}
    return run, files, man


# ───────────────────────── destino: Supabase Storage ─────────────────────────
class Supa:
    def __init__(self):
        self.url = os.environ["SUPABASE_URL"].rstrip("/")
        self.key = os.environ["SUPABASE_SERVICE_KEY"]
        self.bucket = os.environ.get("SUPABASE_BUCKET", "gfs")

    def req(self, method, path, body=None, ctype=None, extra=None):
        h = {"Authorization": "Bearer " + self.key, "apikey": self.key, "User-Agent": UA}
        if ctype:
            h["Content-Type"] = ctype
        h.update(extra or {})
        last = None
        for n in range(4):
            try:
                with urllib.request.urlopen(urllib.request.Request(self.url + path, data=body, headers=h, method=method), timeout=120) as r:
                    return r.read()
            except urllib.error.HTTPError as e:
                if e.code < 500 and e.code != 429:
                    raise RuntimeError(f"Supabase {method} {path}: HTTP {e.code} {e.read()[:200]!r}")
                last = e
            except Exception as e:                       # noqa: BLE001
                last = e
            time.sleep(2 * (n + 1))
        raise RuntimeError(f"Supabase {method} {path}: {last}")

    def put(self, key, data, ctype, cache="31536000"):
        self.req("POST", f"/storage/v1/object/{self.bucket}/{key}", data, ctype, {"x-upsert": "true", "cache-control": f"max-age={cache}"})

    def public(self, key):
        try:
            return http(f"{self.url}/storage/v1/object/public/{self.bucket}/{key}?t={int(time.time())}")
        except Exception:                                # noqa: BLE001
            return None

    def ls(self, prefix=""):
        body = json.dumps({"prefix": prefix, "limit": 1000, "offset": 0}).encode()
        return json.loads(self.req("POST", f"/storage/v1/object/list/{self.bucket}", body, "application/json") or b"[]")

    def rm(self, keys):
        if keys:
            self.req("DELETE", f"/storage/v1/object/{self.bucket}", json.dumps({"prefixes": keys}).encode(), "application/json")


def current_run(sb):
    raw = sb.public("manifest.json")
    try:
        return json.loads(raw).get("run") if raw else None
    except Exception:                                    # noqa: BLE001
        return None


def upload(sb, run, files, man):
    for name, gz in files.items():
        sb.put(f"{run}/{FIELDS[name]['file']}.gz", gz, "application/octet-stream")
    sb.put("manifest.json", json.dumps(man, separators=(",", ":")).encode(), "application/json", cache="60")   # por último: só aponta para ficheiros que já existem
    runs = sorted(i["name"] for i in sb.ls("") if str(i.get("name", "")).isdigit())
    for old in runs[:-KEEP_RUNS]:
        sb.rm([f"{old}/{i['name']}" for i in sb.ls(old)])
        log("apagado ciclo antigo", old)


def main():
    out_dir = os.environ.get("OUT_DIR")
    sb = None if out_dir else Supa()
    run_dt, grib, ranges = find_cycle(dt.datetime.now(dt.timezone.utc).replace(tzinfo=None))
    run = run_dt.strftime("%Y%m%d%H")
    log("ciclo mais recente:", run)
    if sb and os.environ.get("FORCE") != "1" and current_run(sb) == run:
        log("já está guardado; nada a fazer")
        return
    fields = read_fields(grib, ranges)
    run, files, man = build(fields, run_dt)
    if out_dir:
        os.makedirs(os.path.join(out_dir, run), exist_ok=True)
        for name, gz in files.items():
            open(os.path.join(out_dir, run, FIELDS[name]["file"] + ".gz"), "wb").write(gz)
        open(os.path.join(out_dir, "manifest.json"), "w").write(json.dumps(man))
        log("gravado em", out_dir)
    else:
        upload(sb, run, files, man)
        log("enviado para o Supabase:", run)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:                               # noqa: BLE001
        print("[gfs] FALHOU:", e, file=sys.stderr)
        sys.exit(1)