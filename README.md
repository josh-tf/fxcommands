![FXCommands](media/fxcommands-banner.png 'FXCommands')

[![CI](https://github.com/josh-tf/fxcommands/actions/workflows/ci.yml/badge.svg)](https://github.com/josh-tf/fxcommands/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.md) [![Latest Release](https://img.shields.io/github/v/release/josh-tf/fxcommands)](https://github.com/josh-tf/fxcommands/releases/latest)

# FXCommands

Stream Deck plugin for sending commands to the FiveM or RedM client console.

Works with a physical Stream Deck, Stream Deck + or Stream Deck Mobile connected to the same PC
running the game.

[josh.tf/fxcommands](https://josh.tf/fxcommands) | [Wiki & Docs](https://github.com/josh-tf/fxcommands/wiki)

---

## Features

| Feature | Description |
|---------|-------------|
| Single commands | Send any FiveM/RedM console command with one button press |
| Chained commands | Run multiple commands sequentially with `;` separator |
| Delayed commands | Add timed pauses between commands with `;;` or `{NNNms}` |
| Staged buttons | Cycle through up to 5 different commands per button |
| Press and release | Separate commands for key down and key up events |
| Dials (Stream Deck +) | Separate commands for push, rotate left/right, and screen tap |
| Command responses | Show a value returned by your server on the button or dial |
| FiveM and RedM | Works with both games out of the box |

![Stream Deck with FXCommands](media/sd-preview.png 'FXCommands in action')

---

## Getting Started

### Stream Deck Marketplace

[FXCommands on the Stream Deck Store](https://marketplace.elgato.com/product/fxcommands-3c018041-5776-412f-ad1b-1c0da734040b)

### Manual Installation

1. Download the latest `.streamDeckPlugin` from the [Releases](https://github.com/josh-tf/fxcommands/releases/latest) page
2. Double-click the file and accept the Stream Deck installation prompt

---

## Usage

Drag the FXCommands Action onto your Stream Deck and enter the command to execute. You can run a command on press, on release, or both.

### Quick Examples

```sh
# Single command
e wave

# Chained commands (no delay)
e sit;me relaxes on the ground

# Delayed commands
e think;me thinking;{2000ms};e c
```

For a toggle button, set **Stages** to `2` and fill in each stage separately rather than writing
one command, for example `e sit` on stage 0 and `e c` on stage 1. The button advances a stage on each
press.

### Dials (Stream Deck +)

Drop the action onto the dial row of a Stream Deck + and the Property Inspector gains a **Dial**
section with three extra commands. Pushing the dial uses the same **Command** / **On Release**
fields as a key, so a dial can also cycle through stages.

| Trigger | Field | Runs when |
|---------|-------|-----------|
| Push | Command / On Release | The dial is pressed and released |
| Rotate left | Rotate Left | The dial turns anticlockwise |
| Rotate right | Rotate Right | The dial turns clockwise |
| Touch | Touch | The touch strip above the dial is tapped |

Rotation commands support placeholders that are substituted before the command is sent:

| Placeholder | Value |
|-------------|-------|
| `{ticks}` | Detents moved this event, negative left, positive right |
| `{rotationPercent}` | Running position as `0` to `100` |
| `{rotationAbsolute}` | Running position as `0` to `255` |

```sh
# Send the raw detent delta, letting the server apply it
radio_volume_adjust {ticks}

# Send an absolute target the server can set directly
radio_volume_set {rotationPercent}
```

> [!NOTE]
> `{rotationPercent}` and `{rotationAbsolute}` track a counter held by the plugin, not the game's
> real value. It starts at `0`, is clamped to `0`-`255`, and will drift if something changes the
> value in-game. Prefer `{ticks}` unless your server echoes its state back.

### Command responses

A button can display a value your server sends back: current radio volume, fuel level, on-duty
count, anything you can `print`. This is **opt-in per command** via the **Show response** checkbox,
because enabling it changes what your server receives.

#### How it works

When **Show response** is ticked, FXCommands appends a short correlation token to the command:

```
radio_voldown @fxid:ab12cd34
```

It then watches the console for a line **containing that same token**, strips the token out, and
shows what's left. The token exists so that pressing several buttons at once doesn't cross wires.
If nothing matches before the response timeout, the button is left unchanged.

#### Server-side handler

Your command needs to pull the token off the end of its arguments and echo it back with the value.
Client-side Lua:

```lua
RegisterCommand('radio_voldown', function(source, args)
    local sdToken = nil
    if args[#args] and args[#args]:match("^@fxid:") then
        sdToken = table.remove(args)
    end

    -- Regular command logic here

    if sdToken then
        print(("%s %s"):format(sdToken, "60.0"))
    end
end)
```

> [!IMPORTANT]
> Print the token on the **same line** as the value. Its position doesn't matter, it's stripped
> out and whatever remains is displayed. Print nothing else on that line.

> [!CAUTION]
> Only tick **Show response** for commands whose handler strips the token, as shown above. Any
> other command will receive `@fxid:...` as an unexpected extra argument.

#### Displaying the value

| Control | Where the value appears |
|---------|-------------------------|
| Key | The button title |
| Dial | The touch-strip value field |

For keys, **Response Label** controls the formatting. Use `{value}` for the response and `\n` for a
line break; leave it blank to replace the title with the raw response.

```sh
Radio\nVolume\n\n{value}
```

On a dial, a response formatted as a **percentage** additionally draws a progress bar. Print a
trailing `%` to opt in. `60%` shows the bar, `60` shows the value alone.

```lua
print(("%s %d%%"):format(sdToken, volume))
```

#### Init command

**Get Value** runs whenever the button appears (plugin start, profile load, page switch) so the
button shows the current value instead of a stale one. It captures a response the same way, so its
handler needs the same token handling.

Tick **Also run after commands without "Show response"** to re-read the value after any command on
that button, which is useful when the command that changes a value isn't the one that reports it.

**Response Timeout** in Advanced Settings controls how long to wait, defaulting to 1500ms. The
ceiling is 5000ms because the FiveM client drops the connection after five seconds of inactivity.

For full syntax reference, examples, and advanced setups see the [Wiki](https://github.com/josh-tf/fxcommands/wiki).

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Stream Deck](https://www.elgato.com/stream-deck) 6.9+

### Build

```sh
npm install
npm run build
```

Output:
- `dist/tf.josh.fxcommands.sdPlugin/` unpacked plugin
- `dist/tf.josh.fxcommands.streamDeckPlugin` installable package

### Development (watch mode)

```sh
npm run watch
```

### Code quality

```sh
npm run check   # typecheck + lint + format + spell + circular deps
```

### Console emulator

`scripts/fivem-emulator.cjs` stands in for the game so the plugin can be exercised without FiveM
running. It decodes the commands the plugin sends, answers the handshake, and replies to any
command carrying an `@fxid:` token so command responses can be tested end to end.

```sh
node scripts/fivem-emulator.cjs            # echo commands, reply with a simulated value
node scripts/fivem-emulator.cjs --percent  # reply as "60%" to exercise the dial bar layout
node scripts/fivem-emulator.cjs --drop     # never reply, to exercise the capture timeout
node scripts/fivem-emulator.cjs --garbage  # prefix replies with junk, to exercise frame resync
node scripts/fivem-emulator.cjs --split    # split replies across TCP chunks
node scripts/fivem-emulator.cjs --delay=2000 --value=75
```

See the [Contributing](https://github.com/josh-tf/fxcommands/wiki/Contributing) guide for full development setup.

---

## Support

- [Wiki](https://github.com/josh-tf/fxcommands/wiki) - Full documentation, examples, and guides
- [Troubleshooting](https://github.com/josh-tf/fxcommands/wiki/Troubleshooting-Guide) - Common issues and fixes
- [Issues](https://github.com/josh-tf/fxcommands/issues) - Report a bug or request a feature

---

## License

[MIT](LICENSE.md)
