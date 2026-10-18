
<p align="center">
  <img src="favicon.ico" alt="SkyLab logo" width="96" height="96">
</p>

<h1 align="center">SkyLab</h1>

<p align="center">
  <em>The science behind what you see in the sky.</em>
</p>

<p align="center">
  <a href="https://loripori.github.io/SkyLab/"><strong>Open the live app »</strong></a>
</p>

<!-- Badges: small status pills. Format: ![text](image-url). Shields.io makes them. -->
<p align="center">
  <img alt="Vanilla JS" src="https://img.shields.io/badge/stack-vanilla%20JS-f7df1e">
  <img alt="Cloudflare Workers" src="https://img.shields.io/badge/backend-Cloudflare%20Workers-f38020">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green">
</p>

<!-- Screenshot banner. Put the real file names from your /screenshots folder here. -->
<p align="center">
  <img src="screenshots/desktop-landing.png" alt="SkyLab on desktop" width="720">
</p>

---

## Table of contents

<!-- Links to headings: lowercase, spaces become "-", punctuation removed. -->
- [About](#about)
- [Why I built it](#why-i-built-it)
- [Features](#features)
- [Screenshots](#screenshots)
- [SkyLab Terminal](#skylab-terminal)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Run it locally](#run-it-locally)
- [Data sources and credits](#data-sources-and-credits)
- [Privacy and security](#privacy-and-security)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)
- [About me](#about-me)
- [Contact](#contact)

---

## About

<!-- 2 to 4 sentences. What is it, for whom, what makes it different? -->
*Write here: a short, plain description of SkyLab. What does someone get when they open it?*

## Why I built it

<!-- This is the section people remember. Be personal and specific. -->
*Write here: the intention behind the project. What problem or frustration started it? What did you want weather apps to do that they didn't?*

## Features

<!-- A bullet list: start a line with "-" or "*". Bold text uses **double asterisks**. -->

**Maps and radars**
- Global rain radar (NASA IMERG) with animation
- Cloud, wind, temperature and pressure layers, with isobars and **H / L** markers
- Satellite view
- Hurricane and tropical storm tracker

**Forecast and science**
- Hourly, weekly and monthly forecast
- Pollen data
- "Sky Explained" tab that explains the current weather pattern
- Daily science facts and a *Myth or Fact* game

**For your account** *(optional sign-in)*
- Favourite cities synced between devices
- Weather push notifications for your main city
- Account deletion at any time

**Extras**
- Portuguese / English, with units that follow the language
- Mobile interface designed separately from the desktop one
- 3D globe on the landing page
- Clothing advisor orb

## Screenshots

<!-- A table gives a neat grid. The second row (---|---) is required. -->
| Desktop | Mobile |
|:---:|:---:|
| ![Desktop city view](screenshots/desktop-city.png) | ![Mobile city view](screenshots/mobile-city.png) |
| ![Radar](screenshots/radar.png) | ![Terminal](screenshots/terminal.png) |

## SkyLab Terminal

A command line built into the app, for people who want raw atmospheric data.

<!-- Code blocks use three backticks. Add a language name after them for colours. -->
```text
fetch -loc "Lisbon"          # current conditions
calc dew_point               # atmospheric physics helpers
compare -loc1 Lisbon -loc2 Oymyakon
plot --var temperature       # ASCII sparkline
export --format csv          # also: cpp_struct
```

> **Tip:** a line starting with ">" becomes a highlighted quote or note box.

*Write here: the full list of commands, or a link to a docs page.*

## Tech stack

| Layer | What I used |
|---|---|
| Front end | HTML, CSS and JavaScript, no frameworks |
| Back end | Cloudflare Worker + D1 (SQLite) |
| Hosting | GitHub Pages (front end), Cloudflare (worker) |
| Notifications | Web Push (VAPID) |

## Project structure

```text
SkyLab/
├── index.html      # page structure
├── styles.css      # all styling
├── app.js          # all front-end logic
├── sw.js           # service worker (push notifications)
├── worker.js       # Cloudflare Worker (API, auth, proxies)
├── favicon.ico
└── screenshots/
```

## Run it locally

<!-- Numbered lists: "1." on every line also works, Markdown renumbers it. -->
1. Clone the repository:
   ```bash
   git clone https://github.com/loripori/SkyLab.git
   cd SkyLab
   ```
2. Serve the folder with any static server:
   ```bash
   python -m http.server 8000
   ```
3. Open `http://localhost:8000`.

> The worker needs its own setup (Cloudflare account, D1 database, secrets).
> *Write here: link to a SETUP.md, or list the environment variables.*

## Data sources and credits

<!-- Important: most of these services ask for attribution. -->
- [NASA GIBS / IMERG](https://earthdata.nasa.gov/gibs): precipitation and satellite imagery
- [Open-Meteo](https://open-meteo.com/): forecasts and current conditions
- [RainViewer](https://www.rainviewer.com/): radar tiles
- [OpenWeatherMap](https://openweathermap.org/): cloud, wind and temperature tiles
- [IPMA](https://www.ipma.pt/): Portuguese weather warnings
- [NHC](https://www.nhc.noaa.gov/) and [GDACS](https://www.gdacs.org/): tropical storms
- [Atmospore / PollenAPI](https://pollenapi.com/): pollen data

## Privacy and security

*Write here: what data is stored (email, Google ID, location), what is not, how to delete an account, and where the full privacy page is.*

To report a vulnerability, please email the address in [Contact](#contact) instead of opening a public issue.

## Roadmap

<!-- "- [ ]" is an unchecked box, "- [x]" is a checked one. -->
- [x] Radars, forecast, accounts, push notifications
- [x] Terminal with real commands
- [ ] *Next idea*
- [ ] *Another idea*

## Contributing

*Write here: do you accept issues and pull requests? Any rules? Which language should issues be in?*

## License

*Write here: the license (MIT is the usual choice for a hobby project), then add a LICENSE file to the repo.*

## About me

<!-- A photo is optional. Same image syntax: ![alt](path) -->
*Write here: who you are, in your own words. Where you're from, what you do, what else you build.*

## Contact

- Email: skylab.support@gmail.com
- GitHub: [@loripori](https://github.com/loripori)

---

<p align="center">
  <sub>Made in Lisbon. If SkyLab helped you understand the sky a bit better, a ⭐ on the repo is the best thank-you.</sub>
</p>
