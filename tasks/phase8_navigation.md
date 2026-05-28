# Phase 8: User Navigation Mode Tasks

This phase covers building the turn-by-turn navigation overlay, voice announcements, angle-based directions, and the GPS-following camera.

---

## [x] Task 8.1: UI Structure (Sidebar & Floating HUD)

### File
[index.html](file:///\\wsl.localhost/Ubuntu/home/panokatos/SwarmRoute/frontend/index.html)

### Features
- Add a **"Personal Navigation Mode"** card in the sidebar:
  - Dropdown select for **Start Intersection** (A to J).
  - Dropdown select for **Destination Intersection** (A to J).
  - Checkbox: **Selfish routing** (ignores dynamic traffic).
  - Checkbox: **Request Emergency Priority** (checks for karma/emergency routing).
  - Button: **Start Navigation**.
  - Button: **Stop Navigation** (exits GPS tracking).
- Add a **Floating Navigation HUD** overlay (`#navigation-hud` in the top center of the screen, hidden by default):
  - Next turn direction icon (`<i class="fa-solid fa-arrow-up"></i>` etc.).
  - Big text: next instruction (e.g. *"Turn right onto Pireos St"*).
  - Subtext: distance (m) and ETA (s) remaining.

---

## [x] Task 8.2: HUD & GPS Styling

### File
[style.css](file:///\\wsl.localhost/Ubuntu/home/panokatos/SwarmRoute/frontend/style.css)

### Features
- Style the `#navigation-hud` as a premium glassmorphic banner centered at the top of the map.
- Style turn icons and blinking emergency guidance glows.
- Handle active/hidden states with transition fades.

---

## [x] Task 8.3: Navigation & Voice Logic

### File
[app.js](file:///\\wsl.localhost/Ubuntu/home/panokatos/SwarmRoute/frontend/app.js)

### Features
- Define the street mapping dictionary (`STREET_NAMES`) for all 28 bidirectional edge IDs in Athens.
- Implement **Angle-Based Turn Generator**:
  - Calculate bearing (angle in degrees) of vector (From -> To of edge).
  - Compute bearing of current edge and next edge.
  - Calculate difference: `diff := nextBearing - currBearing`. Normalize diff to `[-180, 180]`.
  - Decide instruction:
    - `diff` between `-35` and `35`: *"Continue straight onto [Street]"*
    - `diff` between `35` and `145`: *"Turn right onto [Street]"*
    - `diff` between `-35` and `-145`: *"Turn left onto [Street]"*
    - Otherwise: *"Make a U-turn onto [Street]"*
- Implement **GPS Camera Follow**:
  - During navigation, on every simulation frame, update the map camera using `map.easeTo` or `map.flyTo` centered on the vehicle coordinates, with `pitch: 60`, `zoom: 17`, and `bearing` set to the street's heading direction.
- Implement **Web Speech Guidance**:
  - Whenever the turn instruction text changes, use `window.speechSynthesis` to speak it out loud (checking to make sure we don't repeat the speech repeatedly on every tick).
