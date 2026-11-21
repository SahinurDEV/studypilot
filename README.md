# 🧭 StudyPilot: a smart planner for Notion Student OS

**StudyPilot turns your Notion assignments database into a daily study plan and a deadline-risk radar.**

## The problem

Student OS templates in Notion are great for *storing* assignments, exams and projects, but they don't tell you **what to work on today**. Students end up:

- starting big projects too late because a due date "looked far away",
- missing small deadlines buried under big ones,
- discovering an overloaded week (two exams + a project) only when it's already here.

## What StudyPilot does

1. **Reads your Assignments database** from Notion (title, course, due date, status, priority, effort hours, progress %).
2. **Ranks all open work** by a pressure score: remaining hours ÷ days left, plus urgency, weighted by priority. Overdue work always floats to the top.
3. **Builds today's focus plan** that fits the hours you actually have (e.g. 4h), spreading big tasks across the days before their deadline instead of cramming.
4. **Flags deadline risk** for every task: 🔴 overdue · 🟠 at risk (can't fit before the deadline) · 🟡 tight · 🟢 on track.
5. **Shows workload ahead** week by week and per course, and warns when a week is over your study capacity.
6. **Writes the plan back into Notion** as a "Today's Plan · YYYY-MM-DD" page with checkable to-dos, risk alerts and a workload summary, so the plan lives inside your Student OS.

It runs as an **interactive web dashboard** and as a **CLI**:

- ✔ **Tick off plan blocks** to log the hours, ▶ **focus timer** (15/25/50 min) that logs time to the task when you finish
- ➕ **Add tasks** (press `N`), drag **progress sliders**, mark tasks **done**, all with **Undo**
- 🔎 **Search** (`/`), filter by **course** or **risk** (click a stat card or course bar), **sort** any column
- 📅 **Week plan**: simulates the next 7 days, places every study hour, shows each deadline and warns about work that **won't finish in time**
- 🗓️ **Export to calendar (.ics)**: study blocks (choose your start time) + deadlines into Google / Apple / Outlook Calendar
- 💡 **Smart insights**: coaching tips like *"Start X today: it needs ~3h/day"* or *"Next week is overloaded by 5h"*
- 🔥 **Study stats**: minutes per day for the last 7 days, day streak, most-studied course (fed by the focus timer and ✔ logging)
- 🌙 **Light / dark theme** toggle
- Every change **re-plans your day instantly**, and with Notion connected it's written back to your database
- Polished motion: staggered entrances, loading skeletons, count-up numbers, animated rankings (FLIP), growing bars, ripples. Respects *reduce motion* With no Notion keys it runs in **demo mode** on sample data, so judges can try it in seconds.

## How it uses Notion Student OS

- **Notion API** (`/databases/{id}/query`, `/pages`, `/databases`) through a small built-in client in [`src/notion.js`](src/notion.js). No SDK dependency.
- `npm run setup` **creates a Student OS-style "Assignments" database** in your workspace (Course, Type, Due, Status, Priority, Effort (h), Progress %) and fills it with sample tasks.
- Works with **existing Student OS templates** too: the property mapper accepts common names (`Due` / `Due Date` / `Deadline`, `Course` / `Class` / `Subject`, `Status` as select, status or checkbox, `Progress` as 0–1 or 0–100).
- `npm run sync` (or the dashboard button) **writes the daily plan back** into Notion as a page.

## How AI was used to build it

<!-- TODO: describe how you used Devin Chat (prompts, features Devin built or improved, what you changed). -->

StudyPilot was built with AI coding agents. The planning engine, Notion client, dashboard and tests were written by an AI coding agent from a short spec: "rank student work by real time pressure, fit it into the hours available today, and write the plan back into Notion".

## Run it

Requires **Node.js 18+**. There are no npm dependencies.

```bash
git clone https://github.com/SahinurDEV/studypilot.git
cd studypilot

npm start          # dashboard at http://localhost:3000 (demo data)
npm run plan       # print today's plan in the terminal
npm run plan 6     # ...for 6 available hours
npm test           # run the unit tests
```

### Connect your Notion

1. Create an internal integration at <https://www.notion.so/my-integrations> and copy its token.
2. Create (or pick) a page for StudyPilot, open **••• → Connections**, and add your integration.
3. Copy `.env.example` to `.env` and set `NOTION_TOKEN` and `NOTION_PARENT_PAGE_ID` (the 32-character ID at the end of the page URL).
4. Run `npm run setup`. This creates the Assignments database and prints `NOTION_DATABASE_ID`; add it to `.env`.
   *Already have a Student OS assignments database? Share it with the integration and put its ID in `NOTION_DATABASE_ID` instead.*
5. `npm start`. The dashboard now shows live Notion data, and **Send plan to Notion** creates today's plan page. Or run `npm run sync`.

## Project structure

```
src/planner.js   ranking, risk levels, daily plan, weekly load (pure functions)
src/notion.js    Notion API client + page → task mapping
src/server.js    dashboard server + JSON API (/api/plan, /api/tasks, /api/sync, /api/calendar.ics)
src/cli.js       setup / plan / sync commands
src/sample.js    demo data
public/          dashboard UI (HTML/CSS/JS)
test/            node:test unit tests
```

## How the score works

```
remaining = effort × (1 − progress)
pressure  = remaining ÷ max(daysLeft, 0.5)
score     = (pressure × 4 + 10 ÷ (daysLeft + 1)) × priorityWeight   # High 1.5, Medium 1, Low 0.7
overdue   → score 1000+ (always first)
at risk   → remaining > daysLeft × studyHoursPerDay
```

## License

MIT
