# GitHub Activity

Your GitHub contributions on a [BUSY Bar](https://busy.bar): by day, week, month and year, over the
contribution graph, with your stats on the back screen. The bar reads your public profile over its own
Wi-Fi. No computer, script or GitHub token is involved.

## How to use

- **Start** or **wheel press**: switch between profile, day, week, month and year
- **Wheel turn**: go back in time, one period per click
- **Back**: return to the current period; from there, close the app

The graph lights the period you are looking at and dims the rest. The profile screen shows your user
name and contributions in the last year.

## Install

You need a BUSY Bar connected to Wi-Fi; the app is tested on firmware 1.4.1.

1. Download `app.avachadev.ghactivity.tgz` from the
   [latest release](https://github.com/avachadev/busybar-github-activity/releases/latest).
2. Open the bar's web interface (`http://10.0.4.20` over USB, or the bar's IP on Wi-Fi), go to
   **Apps → Add app** and pick the file.
3. In **Apps → GitHub Activity**, paste your profile link or user name into **GitHub profile** and save.

The graph appears within about 15 seconds and refreshes every 15 minutes. The profile must be public.

## Where the data comes from

GitHub has no token-free API for the contribution graph, so the app reads it through the open-source
[github-contributions-api](https://github.com/grubersjoe/github-contributions-api), which sees only the
public user name and caches answers for about an hour. Contributions are commits, pull requests, issues
and code reviews, as on your profile; private ones count only if your profile shows them.

## Development

Requires Node 24.

```bash
npm install
npm test
npm run build          # dist/app.avachadev.ghactivity.tgz
npm run app:install    # install on the bar connected over USB
```

Releases: push a tag equal to the version in `src/appmeta/manifest.json` and GitHub Actions attaches
the package to the release.

## License

[MIT](LICENSE). GitHub is a trademark of GitHub, Inc. This app is not affiliated with GitHub.
