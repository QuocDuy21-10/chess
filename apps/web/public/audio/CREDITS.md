# Audio credits

All files are CC0 (public domain), downloaded from opengameart.org on 2026-11-12.

| Files | Original | Author | Source |
|---|---|---|---|
| `step0-3`, `land`, `draw`, `hit`, `fall` | `footstep00-03`, `bookPlace1`, `drawKnife1`, `chop`, `dropLeather` | Kenney (kenney.nl) | https://opengameart.org/content/50-rpg-sound-effects |
| `check`, `promote`, `gameover` | `jingles_HIT00`, `HIT07`, `HIT15` | Kenney (kenney.nl) | https://opengameart.org/content/85-short-music-jingles |
| `select`, `error` | `click_001`, `error_004` | Kenney (kenney.nl) | https://opengameart.org/content/interface-sounds |
| `music.mp3` | `The_Old_Tower_Inn.mp3` | RandomMind | https://opengameart.org/content/medieval-the-old-tower-inn |

`music.mp3` was re-encoded from the original on 2026-11-13, to halve the download:
`ffmpeg -i The_Old_Tower_Inn.mp3 -map 0:a -c:a libmp3lame -b:a 128k -ac 2 -ar 44100 -id3v2_version 3 music.mp3`
