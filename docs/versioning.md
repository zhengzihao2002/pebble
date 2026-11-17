# App versioning

Settings ends with `Pebble · Version MAJOR.MINOR.PATCH · revision`.
The build count is retained for internal verification and is not shown in Settings.
The build number counts every commit reachable from the deployed revision,
from the repository's start. The revision identifies the actual source build.
Both are calculated at build time, identically for server and browser output.
Shallow checkouts fetch missing Git history before calculating; source archives
without history display unavailable information instead of a false number.

The repository had no release tags. These retrospective major milestones were
chosen to represent broad changes to the application or its financial model:

| Major | Commit | Milestone |
| --- | --- | --- |
| 1 | `8215d03` | First complete Pebble app |
| 2 | `e92b744` | Financial storage moves from localStorage to Postgres |
| 3 | `8019dd3` | Multi-account financial model |
| 4 | `854e90c` | Completed app redesign and shared application frame |

The reviewed feature-release list since major 4 is recorded by exact commit
in `src/lib/releaseHistory.ts`. Other substantive historical changes are patch
updates; merge, WIP and conventional documentation/test-only commits do not
bump the release version. They still contribute to the build count. Reverting
a shipped feature is a patch, rather than rolling the version number backward.

At `123d119`, the reviewed release is **4.40.3**, from **359 commits**. Adding
the Settings version footer is a minor feature release: **4.41.0 · Build 360**.

Future commits must carry one explicit footer:

```
Release-Type: minor
```

- `major`: broad app/architecture milestone; increment major, reset minor/patch.
- `minor`: additive feature; increment minor, reset patch.
- `patch`: correction/refinement; increment patch.
- `none`: no released behavior change; preserve version, increment build count.

Conventional `feat:` and breaking-change markers are also recognized when the
footer is absent; unclassified substantive commits default to patch. Explicit
footers take priority. Each build reflects its exact commit, so rebuilding the
same revision does not create a different version or build number.
