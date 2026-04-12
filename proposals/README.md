# Proposals workflow

Use this directory for design work that has two parts:

1. `proposal.md`
   A. defines the problem, decisions, rules, and target end state
   B. is the source of truth for design

2. `checklist.md`
   A. turns the proposal into an execution checklist
   B. must not introduce new design decisions that are missing from `proposal.md`

## Directory layout

1. `active/`
   A. proposals still being designed or implemented
   B. a proposal stays here while its design or implementation is still moving

2. `implemented/`
   A. proposals whose code has landed
   B. move a proposal here when the accepted design is implemented and the checklist is effectively complete

3. `rejected/`
   A. proposals that were declined or superseded
   B. move a proposal here when the design is no longer the path forward

## Per-proposal structure

Each proposal lives in its own directory:

1. `proposals/<state>/<id-slug>/proposal.md`
2. `proposals/<state>/<id-slug>/checklist.md`

Example:

1. `proposals/active/0001-postgresql-capability-runtime/proposal.md`
2. `proposals/active/0001-postgresql-capability-runtime/checklist.md`

## Proposal identity

1. Use a stable numbered directory name such as `0001-postgresql-capability-runtime`.
2. Do not renumber existing proposals.
3. Only change the slug portion while the proposal is still `active`, and only if the new name is materially clearer.

## Authoritative files

1. Required files:
   A. `proposal.md`
   B. `checklist.md`

2. Optional files:
   A. `notes.md`
   B. `artifacts/`

3. Only `proposal.md` and `checklist.md` are authoritative.

## Rules

1. Keep `proposal.md` and `checklist.md` in the same proposal directory.
2. Use the directory name as the proposal identity; keep the file names fixed.
3. When the proposal state changes, move the whole proposal directory to `implemented/` or `rejected/`.
4. Do not split a proposal across state directories.
5. Do not copy a proposal into another state unless you are intentionally creating a new forked proposal.
6. If implementation changes the design, update `proposal.md` first, then align `checklist.md`.
7. Keep related notes or artifacts inside the same proposal directory if they are needed later.
