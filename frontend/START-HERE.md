# Apply the updated frontend

1. In your local repository, run `git branch --show-current`. Continue on your feature branch (`feat/ui-github-login`), not `main`.
2. Extract `frontend-updated.zip` into a separate directory.
3. Copy the **contents** of the extracted `frontend` folder into your repository's existing `frontend` folder. Replace matching files. Do not create a nested `frontend/frontend` directory. Do not copy anything into `backend`.
4. Open a terminal inside the repository's `frontend` folder and run:

   ```sh
   npm ci
   npm test
   npm run typecheck
   npm run build
   npm run dev -- --port 5173 --strictPort
   ```

   On Windows, use `npm.cmd` if PowerShell blocks `npm`.

5. Open http://localhost:5173. Use sample values with **Explore demo** to review the UI. No real password is required.
6. Follow `INTEGRATION.md` to configure the public GitHub client ID and callback URL. The backend code exchange still needs an agreed contract; the frontend does not pretend that code capture alone signs you in.
7. Review the changes on your feature branch before committing or pushing. Keep `.env.local`, `node_modules`, and `dist` untracked. `.env.example` is safe to commit because it contains no secrets.

This ZIP was prepared against the frontend archive you supplied on 25 October 2026. If you have pulled or edited more code since supplying it, compare those changes before copying.
