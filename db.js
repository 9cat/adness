var config = require('./config');
var nano = require('nano')(config.couchdb.url);
var couch = nano.use('adness');
var biddingAlg = require('./bidding');

var db = {
  newAuction: function(body, cb) {
    var auction = {
      start: Number(body.start),
      end: Number(body.end),
      slots: Number(body.slots) || 0,
      type: 'auction',
      enabled: true
    };
    couch.insert(auction, cb);
  },
  updateAuction: function(auction, cb) {
    couch.insert(auction, cb);
  },
  allAuctions: function(cb) {
    var currentTime = new Date().getTime();
    couch.view('adness', 'auctions', function(err, body) {
      if (!err) {
        body.rows.forEach(function(doc) {
          var value = doc.value;
          var open = (currentTime >= value.start && currentTime < value.end) && value.enabled;
          value.open = open;
        });
        cb(null, body.rows);
      }
      else {
        cb(err, undefined);
      }
    });
  },
  auctionsTimeRelative: function(cb) {
    var currentTime = new Date().getTime();
    var auctions = {
      open: [],
      closed: [],
      future: [],
      past: []
    };
    couch.view('adness', 'auctions', function(err, body) {
      if (!err) {
        body.rows.forEach(function(doc) {
          var value = doc.value;
          var open = (currentTime >= value.start && currentTime < value.end) && value.enabled;
          value.open = open;
          
          if ((currentTime >= value.start && currentTime < value.end) && value.enabled) {
            auctions.open.push(doc);
          }
          else if ((currentTime >= value.start && currentTime < value.end) && !value.enabled) {
            auctions.closed.push(doc);
          }
          else if (value.start > currentTime) {
            auctions.future.push(doc);
          }
          else if (value.end < currentTime) {
            auctions.past.push(doc);
          }
        });
        cb(null, auctions);
      }
      else {
        cb(err, undefined);
      }
    });

  },
  getAuction: function(auctionId, cb) {
    couch.get(auctionId, null, function(err, body) {
      if (!err) {
        cb(null, body);
      }
      else {
        cb(err, undefined);
      }
    });
  },
  getBidsPerAuction: function (auctionId, cb) {
    var key = auctionId.toString();
    couch.view('adness', 'auctionBids', {startkey: [key,0, 0, 0], endkey: [key,1, {}, {}]}, function(err, body) {
      if (!err) {
        cb(null, body.rows);
      }
      else {
        cb(err, undefined);
      }
    });
  },
  appendBidsToAuction: function(auction, cb) {
    var key = auction.id;
    var params = {startkey: [key,0, 0, 0], endkey: [key,1, {}, {}]};
    couch.view('adness', 'auctionBids', params, function(err, body) {
      if (!err) {
        // first object is the auction itself
        var openAuction = body.rows.splice(0,1)[0].value;
        // the rest of the array are the bids

        // parse out the bids
        var bids = [];
        body.rows.forEach(function(rawBids) {
          bids.push(rawBids.value);
        });

        // figure out winning bids
        var results = biddingAlg(Number(openAuction.slots), bids);

        // add winning bids and bids per slot to openAuction
        openAuction.winningBids = results.winningBids;
        openAuction.bidPerSlot = results.bidPerSlot;

        cb(null, openAuction);
      }
      else { cb(err, undefined); }
    });
  },
  newBid: function(body, cb) {
    var bid = {
      created_at: new Date().getTime(),
      type: 'bid',
      price: Number(body.price),
      slots: Number(body.slots),
      user: body.username,
      auctionId: body.auctionId
    };
    couch.insert(bid, cb);
  }
};


module.exports = db;
