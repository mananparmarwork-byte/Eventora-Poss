BUILD "PENDING" FIX  (do these in order)

The folder ".github" is HIDDEN on Windows/Mac, so it often does not get copied.
A visible copy of the workflow is in:  1_COPY_THIS_WORKFLOW_FILE_VISIBLE/deploy-estimator.yml

STEP 1 - Clear the stuck runs
  GitHub repo -> Actions tab -> open every run that says Pending/Queued/Waiting -> "Cancel workflow".

STEP 2 - Delete the OLD workflow (it still builds the removed "site" folder)
  GitHub repo -> Code tab -> open  .github / workflows
  Open every .yml file EXCEPT deploy-estimator.yml -> click the bin icon (Delete) -> Commit.

STEP 3 - Add the new workflow (easiest, from the GitHub website)
  Code tab -> Add file -> Create new file
  In the name box type exactly:   .github/workflows/deploy-estimator.yml
  Paste the full text of 1_COPY_THIS_WORKFLOW_FILE_VISIBLE/deploy-estimator.yml -> Commit changes.

STEP 4 - Settings check (one time)
  Settings -> Pages -> Source = GitHub Actions
  Settings -> Secrets and variables -> Actions -> Variables tab:
     VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY  (and CUSTOM_DOMAIN if you use one)

STEP 5 - Delete the "site" folder from the repo (GitHub Desktop: delete the folder, commit, push).

If the run still says "Waiting": open the run -> click the yellow "Review deployments" box -> tick github-pages -> Approve.
