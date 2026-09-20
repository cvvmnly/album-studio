# Album Studio

A photo album app with multi-album uploads, a gallery viewer, and shareable album links.

## GitHub Pages deployment

1. Create a GitHub repository named `album-studio`.
2. Push this project to the repository.
3. In GitHub, open the repository settings.
4. Go to Pages.
5. Set the source to GitHub Actions (recommended).
6. Add a workflow that runs `npm install` and `npm run build`.
7. Publish the generated site.

The app is structured to generate a share page at `share.html?album=<album-id>` for public album previews.
