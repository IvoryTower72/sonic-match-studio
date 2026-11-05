# Sonic Match Studio

Windows desktop app for assembling a DJ set by hand. This slice is the Build Set window: a folder of music, a searchable track list, a gig planner, preview, and separate Save and Save As.

The working name is Sonic Match Studio. It has not been run on Ben’s PC.

## Run the window

Requires Node.js 22.

```bash
npm install
npm start
```

`npm start` builds the window and opens it. Use **Open folder** and choose a folder of MP3 or WAV files.

To open a folder immediately:

```bash
npm start -- --library "D:\Music"
```

For a second launch after the first build, without building again:

```bash
npm run open -- --library "D:\Music"
```

While changing the interface:

```bash
npm run dev
```

Checks:

```bash
npm test
npm run typecheck
```

Saved sets are JSON files in Electron’s user-data folder, under `sets`. Save overwrites the current file. Save As writes a new file and leaves the current file as it is. Nothing in this window writes to an audio file.

## What this window does

- Left: the folder you opened, and the saved sets. A larger library is not in this window yet.
- Centre: search, sort, and a track list with title, artist, BPM, key, energy, duration, and an empty Match column.
- Right: target time, full-file total, remaining time, overtime, and the ordered set. Drag a track in. The times update. Overtime is allowed and stays visible.
- Top: the current reference, and preview with play, pause, seek, and volume. Those stay visible. Preview audio is read through `http://127.0.0.1` only. The first response is a normal 200: a 206 that covers the whole file lets Windows show the length and then leave the clock at 0:00.
- Full-file totals are labelled as an estimate. They are not the time the set will run live.
- Set reference is its own action. Changing the reference does not reorder the set. Preview does not either.
- Removing a track takes it out of the set. The audio file stays where it is.

Key and energy come from ID3 tags when those frames are present. On the sample MP3s there is no `TBPM` frame: BPM is shown from the comment and the filename, and the list says so. A value that only comes from the filename is labelled `filename`.

## Left out of this slice

Microsoft CLAP, the reference raffle, Camelot automation, and USB or rekordbox export are not in this window. There is no installer yet.
