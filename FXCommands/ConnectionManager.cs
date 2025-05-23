﻿using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;

namespace FXCommands
{
    internal class ConnectionManager
    {
        private static Dictionary<string, TcpClient> tcpClients = new Dictionary<string, TcpClient>(10);

        public void SendMessage(string message, bool canRetry = true)
        {
            string ipAddress = "127.0.0.1";
            int port = 29200; // fx console

            byte[] b_header = "43:4d:4e:44:00:d2:00:00".Split(':').Select(s => byte.Parse(s, System.Globalization.NumberStyles.HexNumber)).ToArray();
            byte[] b_command = Encoding.UTF8.GetBytes(message + "\n");
            byte[] b_padding = { 0, 0 };
            byte[] b_length = BitConverter.GetBytes((message.Length + 13));
            byte[] b_terminator = { 00 };

            Array.Reverse(b_length);

            byte[] data = b_header.Concat(b_length).Concat(b_padding).Concat(b_command).Concat(b_terminator).ToArray();

            string tcpClientIdentifier = $"{ipAddress}::{port}";

            try
            {
                IPEndPoint ep = new IPEndPoint(IPAddress.Parse(ipAddress), port);

                if (!tcpClients.ContainsKey(tcpClientIdentifier))
                {
                    tcpClients.Add(tcpClientIdentifier, new TcpClient() { NoDelay = true });
                }
                else
                {
                    IPGlobalProperties ipProperties = IPGlobalProperties.GetIPGlobalProperties();
                    TcpConnectionInformation[] tcpConnections = ipProperties.GetActiveTcpConnections()
                        .Where(x => x.LocalEndPoint.Equals(tcpClients[tcpClientIdentifier].Client.LocalEndPoint) &&
                                    x.RemoteEndPoint.Equals(tcpClients[tcpClientIdentifier].Client.RemoteEndPoint))
                        .ToArray();

                    if (tcpConnections == null || tcpConnections.Length == 0 || tcpConnections.First().State != TcpState.Established)
                    {
                        tcpClients[tcpClientIdentifier].Close();
                        tcpClients[tcpClientIdentifier] = new TcpClient() { NoDelay = true };
                    }
                }

                if (!tcpClients[tcpClientIdentifier].Connected)
                {
                    tcpClients[tcpClientIdentifier].Connect(ep);
                }

                if (tcpClients[tcpClientIdentifier].Connected)
                {
                    var tcpStream = tcpClients[tcpClientIdentifier].GetStream();
                    tcpStream.Write(data, 0, data.Length);
                }
            }
            catch (Exception ex)
            {
                tcpClients[tcpClientIdentifier].Close();
                tcpClients[tcpClientIdentifier] = new TcpClient() { NoDelay = true };
                Console.WriteLine(ex.ToString());
            }
        }

        public void InitializeClients()
        {
            tcpClients = new Dictionary<string, TcpClient>();
        }

        public void Dispose()
        {
            foreach (var client in tcpClients.Values)
            {
                client.Close();
                client.Dispose();
            }
        }
    }
}