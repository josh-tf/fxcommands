> [!CAUTION]
> ### Marketplace version is currently outdated
> The latest version is pending approval on the Elgato Marketplace. If you're experiencing issues such as **"action not found"** or **missing settings**, please install manually:
> 1. Go to the **[Latest Release](https://github.com/josh-tf/fxcommands/releases/latest)**
> 2. Download the `.streamDeckPlugin` file
> 3. Double-click the downloaded file to install

![FXCommands](media/fxcommands-banner.png 'FXCommands')

[![CI](https://github.com/josh-tf/fxcommands/actions/workflows/ci.yml/badge.svg)](https://github.com/josh-tf/fxcommands/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.md) [![Latest Release](https://img.shields.io/github/v/release/josh-tf/fxcommands)](https://github.com/josh-tf/fxcommands/releases/latest)

# FXCommands

Stream Deck plugin for sending commands to the FiveM or RedM client console.

Works with a physical Stream Deck (or Stream Deck Mobile) connected to the same PC running the game.

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

# Toggle button (2 stages)
# Stage 0: e sit    Stage 1: e c
```

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
- `dist/tf.josh.fxcommands.sdPlugin/` — unpacked plugin
- `dist/tf.josh.fxcommands.streamDeckPlugin` — installable package

### Development (watch mode)

```sh
npm run watch
```

### Code quality

```sh
npm run check   # typecheck + lint + format + spell + circular deps
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
