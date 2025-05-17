#nullable enable
namespace net.rs64.TexTransCore
{
    [System.Serializable]
    public class TTException : System.Exception
    {
        public object[]? AdditionalMessage;
        public TTException(string message, params object[] additionalMessage) : base(message)
        {
            AdditionalMessage = additionalMessage;
        }
        public TTException(string message, System.Exception inner) : base(message, inner) { }
    }
}
