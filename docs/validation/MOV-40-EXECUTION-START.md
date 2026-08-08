# MOV-40 Execution Start

This branch is reserved for Linear MOV-40 / GitHub #220.

Start point:
- product SHA: `81d3618ce7be28a6ce81363a8bda524cd18ece15`
- product tree: `511c3501bd6a73f7556f636bc9e12ef30935d58d`

Single-writer scope:
- reusable release-evidence sanitizer;
- independent fail-closed credential scanner;
- focused tests only.

Do not modify `.github/workflows/**`, Movie Buff product/gameplay code, migrations, RLS, grants, ACLs, hosted state, or production state.

Required behavior is defined in GitHub #220 and Linear MOV-40.

This marker does not constitute implementation evidence or PASS.
