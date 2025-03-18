> [!IMPORTANT]
> The store listing is currently pending update to the latest version and the URL for this repository has changed. As the codepath has changed in the latest update, you may need to uninstall the old `FiveM Commands` extension before installing the latest version of `FXCommands`
> 
> You can do a manual installation by downloading the plugin via the [Releases](https://github.com/josh-tf/fxcommands/releases/) section in the meantime.

![FXCommands](media/fxcommands-banner.png 'FXCommands')

# FXCommands

Stream Deck plugin for sending commands to the **FiveM** or **RedM** client console.

This plugin works with a **physical Stream Deck** as well as the **Stream Deck iOS and Android** applications. If you don't own the hardware, you can use your phone or tablet as a Stream Deck.

---

## 🚀 Getting Started

Now available on the **Stream Deck Store**:
🔗 [FXCommands on Stream Deck Marketplace](https://marketplace.elgato.com/product/fxcommands-fivem-a6cdf538-76ac-4fc7-b8b8-130ea2b8bcbb)

### **Alternative Installation**

1. Download the latest release from the [Releases](https://github.com/josh-tf/fxcommands/releases/) section.
2. Run the `.streamDeckPlugin` file and accept the **Stream Deck installation prompt**.

---

## 🎮 Usage

📺 **Getting Started Video Tutorial**:
🎥 [Watch Here](https://www.youtube.com/watch?v=D1XrZwVKcFQ)

Simply drag the **FXCommands Action** onto your Stream Deck and enter the **command** to be executed.
You can choose to execute a command **on press, on release, or both**.

---

## 🔧 Advanced Usage

### **Staged Commands**

Under `Advanced Options`, you can set up to **5 stages** for a button.
Each stage runs a different command, cycling through them before returning to stage 0.

#### **Example: Multi-Stage "Me" Commands**

- **Stage 0**: `me opens car boot`
- **Stage 1**: `me inspects boot contents`
- **Stage 2**: `me finds nothing, closes boot`

Each press advances to the next stage. After Stage 2, the next press resets back to Stage 0.

#### **Example: Toggle Emote**

- **Stage 0**: `e sit` — Sit down
- **Stage 1**: `e c` — Cancel emote (stand up)

This creates a **toggle button**: press once to sit, press again to stand.

---

### **Chained Commands**

Commands can be **chained** using the `;` separator.
For example, a button with:

```sh
me sit;me relaxes on the ground
```

Will execute both commands **sequentially** in a single button press.

---

### **Multi-Action with Stream Deck**

FXCommands can be used inside **Multi-Action** buttons for complex interactions.
Example **Timed Emote** using Stream Deck’s Multi-Action:

1. **Action 1:** FXCommands Command → `e think;me thinking`
2. **Action 2:** Delay **2000ms** (2 seconds)
3. **Action 3:** FXCommands Command → `e c`

This button triggers the `think` emote, waits **2 seconds**, then cancels the emote.

---

## 🐞 Bugs and Issues

📖 **Troubleshooting Guide**:
🔗 [Common Issues & Fixes](https://github.com/josh-tf/fxcommands/wiki/Troubleshooting-Guide)

🛠 If you encounter an issue not covered above, please open a **GitHub Issue**.
