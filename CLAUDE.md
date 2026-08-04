@AGENTS.md

## Versioning

Every change ships as a commit with a version bump. Format `0.1.2.3`:

| Position | Meaning |
| --- | --- |
| `0` | Stays `0` until full release. |
| `1` | Major step toward release — a significant shift in feature set. **Requires the user's explicit approval before bumping.** |
| `2` | Smaller but still important changes. |
| `3` | Minor fixes — bugs, copy, tweaks. |

Any position can go into double digits (`0.2.14.3`). Bump exactly one position per commit; lower
positions reset to `0`. Never bump position 1 unasked. `package.json` `version` carries the number.
