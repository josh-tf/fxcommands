using System.Collections.Generic;
using System.Net.Sockets;
using System.Threading.Tasks;
using BarRaider.SdTools;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace FXCommands
{
    [PluginActionId("tf.josh.fxcommands")]
    public class PluginAction : PluginBase
    {
        private const int MAXSTATES = 5;
        private int currentState = 0;
        private PluginSettings settings;
        private ConnectionManager connectionManager;

        private CommandAction CurrentCommandAction => settings.commands[currentState];

        private class PluginSettings
        {
            [JsonProperty(PropertyName = "currentState")]
            public int? StoredState { get; set; } = null;

            [JsonProperty(PropertyName = "desiredStates")]
            public int DesiredStates { get; set; }

            [JsonProperty(PropertyName = "commands")]
            public List<CommandAction> commands { get; set; }

            public PluginSettings()
            {
                commands = new List<CommandAction>(MAXSTATES);
                for (int i = 0; i < MAXSTATES; i++)
                    commands.Add(new CommandAction());
                DesiredStates = MAXSTATES;
            }

            public static PluginSettings CreateDefaultSettings() => new PluginSettings();

            // JSON-bound properties for UI editor
            [JsonProperty(PropertyName = "commandPressed0")]
            public string CommandPressed0
            {
                get => commands[0].CommandPressed;
                set => commands[0].CommandPressed = value;
            }

            [JsonProperty(PropertyName = "commandReleased0")]
            public string CommandReleased0
            {
                get => commands[0].CommandReleased;
                set => commands[0].CommandReleased = value;
            }

            [JsonProperty(PropertyName = "commandPressed1")]
            public string CommandPressed1
            {
                get => commands[1].CommandPressed;
                set => commands[1].CommandPressed = value;
            }

            [JsonProperty(PropertyName = "commandReleased1")]
            public string CommandReleased1
            {
                get => commands[1].CommandReleased;
                set => commands[1].CommandReleased = value;
            }

            [JsonProperty(PropertyName = "commandPressed2")]
            public string CommandPressed2
            {
                get => commands[2].CommandPressed;
                set => commands[2].CommandPressed = value;
            }

            [JsonProperty(PropertyName = "commandReleased2")]
            public string CommandReleased2
            {
                get => commands[2].CommandReleased;
                set => commands[2].CommandReleased = value;
            }

            [JsonProperty(PropertyName = "commandPressed3")]
            public string CommandPressed3
            {
                get => commands[3].CommandPressed;
                set => commands[3].CommandPressed = value;
            }

            [JsonProperty(PropertyName = "commandReleased3")]
            public string CommandReleased3
            {
                get => commands[3].CommandReleased;
                set => commands[3].CommandReleased = value;
            }

            [JsonProperty(PropertyName = "commandPressed4")]
            public string CommandPressed4
            {
                get => commands[4].CommandPressed;
                set => commands[4].CommandPressed = value;
            }

            [JsonProperty(PropertyName = "commandReleased4")]
            public string CommandReleased4
            {
                get => commands[4].CommandReleased;
                set => commands[4].CommandReleased = value;
            }
        }

        public class CommandAction
        {
            public string CommandPressed { get; set; }
            public string CommandReleased { get; set; }
        }

        public PluginAction(SDConnection connection, InitialPayload payload)
            : base(connection, payload)
        {
            settings =
                payload.Settings?.ToObject<PluginSettings>()
                ?? PluginSettings.CreateDefaultSettings();
            currentState = settings.StoredState ?? 0;
            _ = InitializeActionAsync();

            connectionManager = new ConnectionManager();
            connectionManager.InitializeClients();
        }

        public override void Dispose()
        {
            Logger.Instance.LogMessage(TracingLevel.INFO, "Destructor called");
            connectionManager.Dispose();
        }

        public override async void KeyPressed(KeyPayload payload)
        {
            Logger.Instance.LogMessage(TracingLevel.INFO, "Key Pressed");
            if (!string.IsNullOrEmpty(CurrentCommandAction.CommandPressed))
                await SendMessageAsync(CurrentCommandAction.CommandPressed);
        }

        public override async void KeyReleased(KeyPayload payload)
        {
            Logger.Instance.LogMessage(TracingLevel.INFO, "Key Released");
            if (!string.IsNullOrEmpty(CurrentCommandAction.CommandReleased))
                await SendMessageAsync(CurrentCommandAction.CommandReleased);

            currentState = (currentState + 1) % settings.DesiredStates;
            settings.StoredState = currentState;
            await SaveSettings();
            await UpdateUiAsync();
        }

        private async Task InitializeActionAsync()
        {
            await UpdateUiAsync();
        }

        private async Task UpdateUiAsync()
        {
            // Always set the state for built-in imagery
            await Connection.SetStateAsync((uint)currentState);

            // Only flash icon when there are multiple states
            if (settings.DesiredStates > 1)
            {
                string iconFile = GetStateIcon(currentState);
                if (!string.IsNullOrEmpty(iconFile))
                    await Connection.SetImageAsync(iconFile);
            }
        }

        private string GetStateTitle(int state) =>
            settings.commands[state].CommandPressed ?? string.Empty;

        private string GetStateIcon(int state) => $"state{state}.png";

        private async Task SendMessageAsync(string message) =>
            await Task.Run(() => connectionManager.SendMessage(message));

        public override void OnTick() { }

        public override void ReceivedSettings(ReceivedSettingsPayload payload)
        {
            Tools.AutoPopulateSettings(settings, payload.Settings);
            SaveSettings();
            _ = UpdateUiAsync();
        }

        public override void ReceivedGlobalSettings(ReceivedGlobalSettingsPayload payload) { }

        private Task SaveSettings() => Connection.SetSettingsAsync(JObject.FromObject(settings));
    }
}
