#!/usr/bin/env node

require('epipebomb')();
var csv = require('csv-parse');
var record = require('csv-record-parser-stream');
var parseNumber = require('parse-number');
var categories = require('./mapping.json');
var through = require('through');
var moment = require('moment');
var compose = require('composite');
var matchers = {};

Object.keys(categories).forEach(function(key){
  matchers[key] = new RegExp(key, "i");
});

function map(fn) {
  return through(function(data){
    this.queue(fn(data));
  });
}

function rbc(csv) {
  var amount = parseNumber(csv.col("cad$"));
  amount = isNaN(amount) ? parseNumber(csv.col("usd$")) : amount;

  return {
    accountType: csv.col('account type'),
    accountNumber: csv.col('account number'),
    date: new Date(csv.col('transaction date')),
    description: csv.col('description 1'),
    description2: csv.col('description 2'),
    amount: amount
  };
}

function typeCategory(type) {
  switch (type) {
    case "Chequing":
    case "Savings":
      return "Assets";
    case "Visa":
      return "Liabilities";
    default:
      return "Unknown";
  }
}

function sourceCategory(entry) {
  var type = entry.accountType;
  return typeCategory(type) + ":" + type;
}

function destinationCategory(entry) {
  for (var key in categories) {
    if (matchers[key].test(entry.description)) {
      return categories[key];
    }
  }

  return "Uncategorized";
}

function getPaymentPosting(entry) {
  return [
    { category: "Assets:Chequing", amount: -entry.amount },
    { category: destinationCategory(entry), amount: entry.amount }
  ];
}

function getPostings(entry){
//if (/payment/i.test(entry.description))
//  return getPaymentPosting(entry);

  return [
    { category: sourceCategory(entry), amount: entry.amount },
    { category: destinationCategory(entry), amount: -entry.amount }
  ];
}

function rbcToLedger(obj) {
  var desc = [obj.description];
  if (obj.description2) desc.push(obj.description2);
  var postings = getPostings(obj);
  return {
    date: obj.date,
    description: desc.join(" - "),
    postings: postings
  };
}


function strLedger(obj) {
  var date = moment(obj.date).format('YYYY/M/D');
  var out = [date + " " + obj.description];

  function posting(p) {
    return ["", p.category, p.amount].join("\t");
  }

  var postings = obj.postings.map(posting);

  out = out.concat(postings);
  return out.join("\n") + "\n\n";
}



process.stdin
.pipe(csv())
.pipe(record(rbc))
.pipe(map(compose(strLedger, rbcToLedger)))
.pipe(process.stdout);

