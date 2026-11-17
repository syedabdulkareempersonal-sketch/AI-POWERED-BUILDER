# Syed Abdul Kareem — Portfolio

Static portfolio site (no build step). Serve the folder with any web server (the 3D robot is an ES module, which browsers will not load from a double-clicked `file://` page; the site then shows a still image of the robot instead):

```
python3 -m http.server 8000
```

- `index.html` — all content
- `css/styles.css` — styling, dark/light themes
- `js/main.js` — page behaviour, project cards and case studies (edit the `PROJECTS` list to add live URLs)
- `js/robot.js` — the interactive 3D hero robot (three.js, vendored in `js/vendor/`)
- `assets/` — images and self-hosted fonts

To self-host the reel instead of the YouTube embed, add `assets/video/reel.mp4` and set
`data-video="assets/video/reel.mp4"` on `#reelPlayer` in `index.html`.
