// qb-formula-mode.js - REVISED: Added support for variables and fixed partial keyword matching.
(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    mod(require("../../lib/codemirror"));
  else if (typeof define == "function" && define.amd) // AMD
    define(["../../lib/codemirror"], mod);
  else // Plain browser env
    mod(CodeMirror);
})(function(CodeMirror) {
"use strict";

CodeMirror.defineMode("qb-formula", function(config, parserConfig) {

  const functionKeywords = (parserConfig && parserConfig.keywords) ? parserConfig.keywords : [
    "Abs", "AdjustDate", "AdjustTime", "Avg", "Begins", "Case", "Contains", "Count", "Date", "Day", "DayOfWeek", "Days", "Duration", "Ends", "First", "Hours", "If", "Last", "Left", "Length", "Max", "Mid", "Min", "Minutes", "Month", "Now", "Nth", "Nz", "Right", "Round", "Seconds", "Size", "StDev", "Sum", "TextToDate", "TextToTime", "Time", "TimeOfDay", "Today", "ToDate", "ToDays", "ToFormattedText", "ToNumber", "ToText", "ToTime", "ToTimestamp", "ToUser", "ToUsers", "Trim", "Trunc", "UserRoles", "Weekday", "WeekdayName", "Weeknum", "Weeks", "Workday", "WorkdayAdd", "Year", "URLRoot", "Dbid", "AppID", "Split", "MSecond", "ToTimeofDay"
  ];

  const variableKeywords = [
    "var", "bool", "number", "text", "textlist", "date", "datetime",
    "duration", "timeofday", "workdate", "user", "recordlist"
  ];

  const allKeywords = functionKeywords.concat(variableKeywords);
  // Ensure we match whole words only using word boundaries (\b)
  const escapedKeywords = allKeywords.map(kw => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const keywords = new RegExp("\\b(" + escapedKeywords.join('|') + ")\\b", "i");
  
  const field = /\[[^\]]+\]/;
  const string = /"(?:[^\\]|\\.)*?"/;
  const number = /0x[a-f\d]+|[-+]?(?:\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/i;
  const comment = /\/\/.*/;
  const literal = /\b(?:true|false|null)\b/i;
  const operator = /[-+\/*=<>!&]+|\b(?:and|or|not)\b/i;
  
  // --- NEW: Regex for variables starting with $ ---
  const variable = /\$[a-zA-Z_][\w]*/;

  // --- NEW: Regex for any other identifier that isn't a keyword ---
  const identifier = /[a-zA-Z_][\w]*/;

  return {
    token: function(stream) {
      if (stream.match(comment)) return "comment";
      if (stream.match(field)) return "variable-2"; // Style for [Fields]
      if (stream.match(string)) return "string";
      
      // --- NEW: Match variables before keywords ---
      if (stream.match(variable)) return "variable-3"; // A different style for $variables

      if (stream.match(keywords)) return "keyword";
      if (stream.match(literal)) return "atom";
      if (stream.match(number)) return "number";
      if (stream.match(operator)) return "operator";

      // --- NEW: Match generic identifiers last ---
      if (stream.match(identifier)) return "variable"; // Default style for other words

      // If nothing matched, advance the stream and return null
      stream.next();
      return null;
    }
  };
});

});