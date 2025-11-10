#nullable enable
using System;

namespace net.rs64.TexTransCore
{

    public static class TTLog
    {
        public static void Info(string code, params object[] args) { Log(code, args); }
        public static void Log(string code, params object[] args)
        {
            LogCall?.Invoke(code, args);
        }
        public static void Warning(string code, params object[] args)
        {
            WarningCall?.Invoke(code, args);
        }
        public static void Error(string code, params object[] args)
        {
            ErrorCall?.Invoke(code, args);
        }
        public static void Exception(Exception e, string additionalStackTrace = "")
        {
            ExceptionCall?.Invoke(e, additionalStackTrace);
        }

        public static void Assert(bool v, string code = "", params object[] args)
        {
            if (v) { return; }

            AssertionFailedPreCall?.Invoke(code, args);
            throw new TTException("TTLog Assertion filed!\n" + code + "\n", args);
        }

        public static Action<string, object[]>? LogCall;
        public static Action<string, object[]>? WarningCall;
        public static Action<string, object[]>? ErrorCall;
        public static Action<Exception, string>? ExceptionCall;
        public static Action<string, object[]>? AssertionFailedPreCall;
    }


}
