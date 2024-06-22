![FXCommands by EggRP](https://i.imgur.com/Uk1afn1.png 'FXCommands')

# FXCommands

Stream Deck plugin for sending commands to the FiveM client console

This plugin works with a phisicial Stream Deck as well as the Stream Deck iOS and Android applications, if you don't own the hardware you can use your phone or tablet as a Stream Deck.

# Getting Started

Now available on the Stream Deck store: https://marketplace.elgato.com/product/fxcommands-fivem-a6cdf538-76ac-4fc7-b8b8-130ea2b8bcbb

Alternatively,
- Download the Stream Deck plugin from the releases section [here](https://github.com/EggRP/fxcommands/releases/)
- Run the file and accept the Stream Deck install prompt

# Usage

You can view the getting started tutorial and video [here](https://egg-rp.com/streamdeck/)

Simply drag the action to your Stream Deck and fill in the command to be executed, you can chose to have a command executed when pressed or when released (or even both)

## Advanced Usage

Under `Advanced Options` you will find the option to select the number of stages (up to 5 total), staged commands will change the buttons action in stages before returning back to the first stage, as an example you could set up a command like:

**Type multiple me commands**

- Stage 0: `me opens car boot`
- Stage 1: `me inspects boot contents`
- Stage 2: `me finds nothing, closes boot`

Your first press of the button will run the stage 0 command, the second press will run stage 1 and then the third press will run stage 2. If you press the button again, you will be back to stage 0.

You can use stage commands for things like emotes for a toggle, for example:

- Stage 0: `e sit` -- sit down
- Stage 1: `e c` -- cancel emote (stand up)

This will result in a button you press to sit down and press again to stand up (cancel emote)

**Chained commands**

You can also chain commands by separating with a `;` character, for example a button with the command `me sit;me relaxes on the ground` - this will run both commands with one button press.

**Other usage**

You can use the command action in existing Stream Deck tools, for example the mutli-action with the delay action or in combination with the keypress action to create more complex buttons and combinations.

As an example, you could add a Stream Deck multi-action and add the following:

- Action 1: FXCommands Command `e think;me thinking`
- Action 2: Delay(2000)
- Action 3: FXCommands Command `e c`

This would create a button that would run the `think` emote, pause for 2 seconds and then cancel the emote.

# Bugs and Issues

Please open a Github issue if you encounter any problems
