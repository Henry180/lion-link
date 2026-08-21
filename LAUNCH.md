# Lion Link launch checklist

## 1. Deploy the API first

Deploy the `backend` folder to a Node.js host such as Render or Railway. Add every value from `backend/.env.example` as an environment variable, using real secret values. Set `CLIENT_ORIGIN` to the final Netlify address. Confirm the API host responds at `https://YOUR-API/`.

## 2. Deploy to Netlify

Connect this repository in Netlify. The included `netlify.toml` needs no build command. Add one Netlify environment variable:

`LION_LINK_API_URL=https://YOUR-API/api`

Deploy. The site sends browser API requests to `/api`; Netlify securely forwards them to your backend.

## 3. Verify before sharing

- Sign up, log in, create a post, upload an image and a video, and send a message.
- Verify the PWA install action in Chrome/Edge and “Add to Home Screen” in Safari.
- Ensure the final Netlify URL exactly matches `CLIENT_ORIGIN`.
- Keep MongoDB backups enabled and do not commit `.env` files.

## Cloudflare Pages launch (recommended)

This project now includes a Cloudflare Pages Function in `functions/api/[[path]].js`. It forwards website requests from `/api` to your backend, so the sign-in button works without exposing the backend address in the browser.

1. Put this whole project on GitHub. Include the new `functions` folder; do not upload `backend/.env`.
2. Deploy the `backend` folder to Render or Railway first. Set root directory to `backend`, start command to `npm start`, and add `MONGODB_URI`, `JWT_SECRET`, and `ADMIN_INVITE_CODE` from `backend/.env.example`.
3. Open the backend's web address after it deploys. It should say `Lion Link API is running`. Copy its address and add `/api` to the end.
4. In Cloudflare select **Workers & Pages** > **Create application** > **Pages** > **Import an existing Git repository**, then choose this repository.
5. Select Framework preset **None**, leave build command empty, set build output directory to `.`, then select **Save and Deploy**. Use Git deployment, not direct upload: Cloudflare only deploys the included Function through Git or Wrangler.
6. In the new Pages project open **Settings** > **Variables and Secrets** > **Add**. For both Production and Preview add `LION_LINK_API_URL` with the backend address from step 3, including `/api`.
7. Redeploy Pages. Copy its `https://...pages.dev` address.
8. In Render/Railway set `CLIENT_ORIGIN` to exactly that Pages address (no ending slash), then redeploy the backend.
9. Test in a private/incognito browser: create an account, log out, and sign in. Also create, edit, and delete a comment. Comments are editable for 15 minutes; deletion remains available.
10. To diagnose a connection issue, open `https://YOUR-PAGES-ADDRESS/api/auth/me`. A `401 Authentication required` response proves the bridge is working. `503` means the Pages variable is missing; `502` means the backend is unavailable.
<!-- deployment update -->
For a custom domain, open your Pages project > **Custom domains**, follow the DNS instructions, then update `CLIENT_ORIGIN` on your backend to the new `https://` address and redeploy it.
