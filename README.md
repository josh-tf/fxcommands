> [!IMPORTANT]  
> The `FXCommands` extension is now published on the [Elgato Marketplace](https://marketplace.elgato.com/product/fxcommands-3c018041-5776-412f-ad1b-1c0da734040b) 🕹️
>
> Due to changes in the code path and extension ID, **you'll need to uninstall the old `FiveM Commands` extension before installing `FXCommands`**.  
>  
> If you'd prefer a manual install or the Marketplace is temporarily unavailable, you can download the latest version directly from the [Releases](https://github.com/josh-tf/fxcommands/releases/) section.

![FXCommands](media/fxcommands-banner.png 'FXCommands')

# FXCommands

Stream Deck plugin for sending commands to the **FiveM** or **RedM** client console.

This plugin works with a **physical Stream Deck** as well as the **Stream Deck iOS and Android** applications. If you don't own the hardware, you can use your phone or tablet as a Stream Deck.

---

## 🚀 Getting Started

Now available on the **Stream Deck Store**:
🔗 [FXCommands on Stream Deck Marketplace](https://marketplace.elgato.com/product/fxcommands-3c018041-5776-412f-ad1b-1c0da734040b)

### **Alternative Installation**

1. Download the latest release from the [Releases](https://github.com/josh-tf/fxcommands/releases/) section.
2. Run the `.streamDeckPlugin` file and accept the **Stream Deck installation prompt**.

---

## 🎮 Usage

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
e sit;me relaxes on the ground
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
