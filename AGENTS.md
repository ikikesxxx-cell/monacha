<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- AI chat streams through server route src/routes/api/chat.ts and photo generation through src/routes/api/avatar.ts; both verify the bearer token via src/lib/server/user.ts — server routes don't get serverFn auth middleware.
- Avatar photos live in a private storage bucket served by long-lived signed URLs — the workspace blocks public buckets.
- Photo "learning" is prompt steering from the user's accepted/declined generations (src/lib/photo-learning.ts), not model training.
