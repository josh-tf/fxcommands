﻿using BarRaider.SdTools;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Collections.Generic;
using System.Net.Sockets;
using System.Threading.Tasks;

namespace FXCommands
{
    [PluginActionId("tf.josh.fxcommands")]
    public class PluginAction : PluginBase
    {

        readonly static int MAXSTATES = 5;
        private static bool firstPluginLoad = true; 
        private int currentState = 0;
        
        private CommandAction CurrentCommandAction => settings.commands[currentState];

        private class PluginSettings
        {
            [JsonProperty(PropertyName = "currentState")]
            public int? StoredState { get; set; } = null;

            PluginSettings()
            {
                commands = new List<CommandAction>(MAXSTATES);
                for (int i = 0; i < MAXSTATES; i++)
                {
                    commands.Add(new CommandAction());
                }
            }

            public static PluginSettings CreateDefaultSettings()
            {
                PluginSettings instance = new PluginSettings();

                instance.commands = new List<CommandAction>(MAXSTATES);
                for (int i = 0; i < MAXSTATES; i++)
                {
                    instance.commands.Add(new CommandAction());
                }

                return instance;
            }

            public List<CommandAction> commands = new List<CommandAction>(5);

            Dictionary<string,
            TcpClient> tcpClients = new Dictionary<string,
            TcpClient>();

            [JsonProperty(PropertyName = "desiredStates")]
            public int DesiredStates
            {
                get;
                set;
            }

            #region State0

            [JsonProperty(PropertyName = "commandPressed0")]
            public string CommandPressed0
            {
                get
                {
                    return commands[0].CommandPressed;
                }
                set
                {
                    commands[0].CommandPressed = value;
                }
            }

            [JsonProperty(PropertyName = "commandReleased0")]
            public string CommandReleased0
            {
                get
                {
                    return commands[0].CommandReleased;
                }
                set
                {
                    commands[0].CommandReleased = value;
                }
            }
            #endregion

            #region State1

            [JsonProperty(PropertyName = "commandPressed1")]
            public string CommandPressed1
            {
                get
                {
                    return commands[1].CommandPressed;
                }
                set
                {
                    commands[1].CommandPressed = value;
                }
            }

            [JsonProperty(PropertyName = "commandReleased1")]
            public string CommandReleased1
            {
                get
                {
                    return commands[1].CommandReleased;
                }
                set
                {
                    commands[1].CommandReleased = value;
                }
            }
            #endregion

            #region State2

            [JsonProperty(PropertyName = "commandPressed2")]
            public string CommandPressed2
            {
                get
                {
                    return commands[2].CommandPressed;
                }
                set
                {
                    commands[2].CommandPressed = value;
                }
            }

            [JsonProperty(PropertyName = "commandReleased2")]
            public string CommandReleased2
            {
                get
                {
                    return commands[2].CommandReleased;
                }
                set
                {
                    commands[2].CommandReleased = value;
                }
            }
            #endregion

            #region State3

            [JsonProperty(PropertyName = "commandPressed3")]
            public string CommandPressed3
            {
                get
                {
                    return commands[3].CommandPressed;
                }
                set
                {
                    commands[3].CommandPressed = value;
                }
            }

            [JsonProperty(PropertyName = "commandReleased3")]
            public string CommandReleased3
            {
                get
                {
                    return commands[3].CommandReleased;
                }
                set
                {
                    commands[3].CommandReleased = value;
                }
            }
            #endregion

            #region State4

            [JsonProperty(PropertyName = "commandPressed4")]
            public string CommandPressed4
            {
                get
                {
                    return commands[4].CommandPressed;
                }
                set
                {
                    commands[4].CommandPressed = value;
                }
            }

            [JsonProperty(PropertyName = "commandReleased4")]
            public string CommandReleased4
            {
                get
                {
                    return commands[4].CommandReleased;
                }
                set
                {
                    commands[4].CommandReleased = value;
                }
            }
            #endregion

        }

        public class CommandAction
        {

            public string CommandPressed
            {
                get;
                set;
            }

            public string CommandReleased
            {
                get;
                set;
            }

        }

        #region Private Members

        private PluginSettings settings;

        private ConnectionManager connectionManager;

        #endregion
        public PluginAction(SDConnection connection, InitialPayload payload) : base(connection, payload)
        {
            settings = payload.Settings?.ToObject<PluginSettings>() ?? PluginSettings.CreateDefaultSettings();

            if (firstPluginLoad)
            {
                settings.StoredState = null;
                _ = SaveSettings();
                firstPluginLoad = false;

                currentState = 0;
                _ = SetStateAsync(0);
            }
            else
            {
                currentState = settings.StoredState ?? 0;
                _ = SetStateAsync((uint)currentState);
            }

            connectionManager = new ConnectionManager();
            connectionManager.InitializeClients();
        }

        public override void Dispose()
        {
            settings.StoredState = null;
            _ = SaveSettings();

            Logger.Instance.LogMessage(TracingLevel.INFO, "Destructor called");
            connectionManager.Dispose();
            System.GC.Collect(); // Force garbage collection
        }

        public override async void KeyPressed(KeyPayload payload)
        {
            Logger.Instance.LogMessage(TracingLevel.INFO, "Key Pressed");
            if (!string.IsNullOrEmpty(CurrentCommandAction.CommandPressed))
            {
                await SendMessageAsync(CurrentCommandAction.CommandPressed);
            }
        }

        public override async void KeyReleased(KeyPayload payload)
        {
            Logger.Instance.LogMessage(TracingLevel.INFO, "Key Released");

            if (!string.IsNullOrEmpty(CurrentCommandAction.CommandReleased))
            {
                await SendMessageAsync(CurrentCommandAction.CommandReleased);
            }

            currentState++;
            if (currentState >= settings.DesiredStates)
                currentState = 0;

            settings.StoredState = currentState;
            await SaveSettings();
            await SetStateAsync((uint)currentState);
        }

        private async Task SendMessageAsync(string message)
        {
            await Task.Run(() => connectionManager.SendMessage(message));
        }

        public override void OnTick() { }

        public override void ReceivedSettings(ReceivedSettingsPayload payload)
        {
            Tools.AutoPopulateSettings(settings, payload.Settings);
            SaveSettings();
        }

        public override void ReceivedGlobalSettings(ReceivedGlobalSettingsPayload payload) { }

        #region Private Methods

        private Task SaveSettings()
        {
            return Connection.SetSettingsAsync(JObject.FromObject(settings));
        }

        private Task SetStateAsync(uint state)
        {
            return Connection.SetStateAsync(state);
        }

        #endregion
    }
}