if (!window.SNIPPY_DEBUG_MODE) {
  console.log = console.info = console.debug = console.warn = () => {};
}


(function(mod) {
  if (typeof exports == "object" && typeof module == "object") 
    mod(require("../../lib/codemirror"));
  else if (typeof define == "function" && define.amd) 
    define(["../../lib/codemirror"], mod);
  else 
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
  
  const escapedKeywords = allKeywords.map(kw => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const keywords = new RegExp("\\b(" + escapedKeywords.join('|') + ")\\b", "i");
  
  const field = /\[[^\]]+\]/;
  const string = /"(?:[^\\]|\\.)*?"/;
  const number = /0x[a-f\d]+|[-+]?(?:\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/i;
  const comment = /\/\/.*/;
  const literal = /\b(?:true|false|null)\b/i;
  const operator = /[-+\/*=<>!&]+|\b(?:and|or|not)\b/i;
  
  
  const variable = /\$[a-zA-Z_][\w]*/;

  
  const identifier = /[a-zA-Z_][\w]*/;

  return {
    token: function(stream) {
      if (stream.match(comment)) return "comment";
      if (stream.match(field)) return "variable-2"; 
      if (stream.match(string)) return "string";
      
      
      if (stream.match(variable)) return "variable-3"; 

      if (stream.match(keywords)) return "keyword";
      if (stream.match(literal)) return "atom";
      if (stream.match(number)) return "number";
      if (stream.match(operator)) return "operator";

      
      if (stream.match(identifier)) return "variable"; 

      
      stream.next();
      return null;
    }
  };
});

});