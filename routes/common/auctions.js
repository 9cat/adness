/* jshint node: true */
'use strict';

var db = require(__dirname + '/../../db');
var _ = require('lodash');
var moment = require('moment');
var config = require('../../config');
var probability = require('../../auction_probability');
var auctionEnd = require('../../events/auction-close');

module.exports = {
  showAuction: function (req, models) {
    // show any errors
    var errorMessage = req.flash('error');
    // template variables
    var auction = models.auction;
    var bids = models.bids;
    var minutes = config.antiSnipeMinutes;
    var registered = models.auctionUser && models.auctionUser.registered;
    var userMessage;
    if (models.auctionUser && models.auctionUser.userMessage) {
      userMessage = models.auctionUser.userMessage;
    }

    // find all approved ads for this user
    var userAds = models.userAds;
    var approvedAds = _.filter(userAds, function(ad) {
      return ad.approved === true;
    });

    // get all regions for all approved ads
    var approvedRegions = [];
    approvedAds.forEach(function(ad) {
      approvedRegions = approvedRegions.concat(ad.regions);
    });
    approvedRegions = _.uniq(approvedRegions);

    // find lowest price for each auction region
    auction.regions.forEach(function(region) {
      // find latest price for this region
      var latestPrice;
      // first check if there are slots open
      if (region.slots > region.primarySlots.length) { latestPrice = 0.50; }
      else {
        // otherwise find the lowest price
        var bidLength = region.winningBids.length - 1;
        latestPrice = region.winningBids[bidLength].price + 0.05;
        latestPrice = Number(latestPrice).toFixed(2);
      }
      region.latestPrice = latestPrice;
    });

    // number of reservedSlots and auction probabilities
    var reservedAds = models.reservedAds || [];
    probability.probability(auction, reservedAds);

    // update start and end time 
    var startTime = moment(auction.start).utc().format('YYYY MMMM D, h:mm:ss A ZZ');
    startTime += ' (' + moment(auction.start).fromNow() + ')';
    auction.startFormatted = startTime;
    var endTime = moment(auction.end).utc().format('YYYY MMMM D, h:mm:ss A ZZ');
    endTime += ' (' + moment(auction.end).fromNow() + ')';
    auction.endFormatted = endTime;
    
    var adsStartTime = moment(auction.adsStart).utc();
    adsStartTime = adsStartTime.format('YYYY MMMM D, h:mm:ss A ZZ');
    adsStartTime += ' (' + moment(auction.adsStart).utc().fromNow() + ')';
    auction.adsStart = adsStartTime;
    var adsEndTime = moment(auction.adsEnd).utc();
    adsEndTime = adsEndTime.format('YYYY MMMM D, h:mm:ss A ZZ');
    adsEndTime += ' (' + moment(auction.adsEnd).utc().fromNow() + ')';
    auction.adsEnd = adsEndTime;

    // remove first item because it's the auction
    models.bids.splice(0, 1);

    // separate bids by region
    var sortedBids = {};
    // for each region in the auction
    auction.regions.forEach(function(region) {
      // get the region name
      var regionName = region.name;

      // get all the bids for this region
      var regionBids = _.filter(bids, function(bid) {
        return bid.region === regionName;
      });

      // sort bids by time
      regionBids = _.sortBy(regionBids, function(bid) {
        return bid.created_at;
      });

      // update creation time for bids
      regionBids.forEach(function(bid) {
        var bidTime = moment(bid.created_at).utc().format('YYYY MMMMM D, h:mm:ss A ZZ');
        bid.created_at = bidTime + ' (' + moment(bid.created_at).fromNow() + ')';
      });

      // set all the bids to sortedBids
      sortedBids[regionName] = regionBids;
    });

    // add target="_blank" to auction description
    var targetBlank = '<a target="_blank"';
    auction.description = auction.description.replace('<a', targetBlank);

    // render view
    return {
      auction: auction,
      bids: sortedBids,
      minutes: minutes,
      registered: registered,
      userMessage: userMessage,
      approvedRegions: approvedRegions,
      errorMessage: errorMessage
    };
  },
  editAuction: function(req, models) {
    var auction = models.auction;
    var bids = models.bids;

    // cull regions
    var regions = _.pluck(config.regions, 'name');
    
    // pull all the regions in bids
    var bidRegions = [];
    bids.forEach(function(bid) {
      bidRegions.push(bid.region);
      return;
    });
    bidRegions = _.uniq(bidRegions);

    // for each region, mark if region has a bid
    auction.regions.forEach(function(region) {
      if (_.contains(bidRegions, region.name)) {
        region.hasBids = true;
      }
    });

    return {
      auction: auction,
      regions: regions
    };
  },
  setAuctionEnabled: function(enabled, models, cb) {
    // enable auction
    models.auction.enabled = enabled;
    // save auction
    db.updateAuction(models.auction, cb);
  },
  newAuction: function(req, cb) {
    db.newAuction(req.body, cb);
  },
  updateAuction: function(req, models, cb) {
    var auction = models.auction;
    var bids = models.bids;

    // validate bids regions (need in the api call)
    if (req.body.regions) {
      // get all region names from bids
      var bidRegions = [];
      bids.forEach(function(bid) {
        bidRegions.push(bid.region);
        return;
      });
      bidRegions = _.uniq(bidRegions);

      // get existing regions with bids
      var regionsWithBids = [];
      auction.regions.forEach(function(region) {
        if (_.contains(bidRegions, region.name)) {
          regionsWithBids.push(region);
        }
      });

      // make sure regions in regionsWithBids are in the req.body.regions
      var reqRegionNames = _.pluck(req.body.regions, 'name');
      regionsWithBids.forEach(function(region) {
        if (!_.contains(reqRegionNames, region.name)) {
          delete region.winningBids;
          delete region.primarySlots;
          delete region.secondarySlots;
          req.body.regions.push(region);
        }
      });
    }

    if (req.body.start) { auction.start = req.body.start; }
    if (req.body.end) { auction.end = req.body.end; }
    if (req.body.adsStart) { auction.adsStart = req.body.adsStart; }
    if (req.body.adsEnd) { auction.adsEnd = req.body.adsEnd; }
    if (req.body.enabled) { auction.enabled = req.body.enabled; }
    if (req.body.description) { auction.description = req.body.description; }
    if (req.body.regions) { auction.regions = req.body.regions; }

    db.updateAuction(auction, function(err, body) {
      if (err) { console.log(err); }
      if (body) {
        // update air object 
        var air = {
          auctionId: auction._id,
          adsStart: Number(auction.adsStart),
          adsEnd: Number(auction.adsEnd)
        };
        db.getAdsInRotation(auction._id + '-air', function(err, result) {
          if (result) {
            db.upsertAdsInRotation(air, function(err) {
              if (err) { console.log(err); cb(err); }
              var message = 'Updated AIR object for auction: ';
              message += auction._id;
              console.log(message);
            });
          }
        });
      }
      return cb(err, body);
    });
  },
  deleteAuction: function(req, cb) {
    db.deleteAuction(req.params.auctionId, cb);
  },
  recalculateAuction: function(req, message, httpStatus, models, cb) {
    var auction = models.auction;

    // make sure auction is closed
    if (auction && auction.open) {
      message += 'Auction is still open.';
      console.log(message);
      httpStatus = 500;
    }

    // figure out the current recalcultion round
    db.getRecalculations(function(err, results) {
      if (err) {
        console.log(err);
        httpStatus = 500;
      }

      // find recalculation for this auction
      var recalculation = _.find(results, function(result) {
        return auction && auction._id === result.auctionId;
      });

      // if no recalculation found, run with max round params
      if (!recalculation) {
        recalculation = {};
        recalculation.auctionId = auction._id;
        recalculation.round = config.rounds.maxRounds;
        var now = new Date().getTime();
        var lastRound = config.rounds['round' + recalculation.round];
        recalculation.expiration = now + lastRound;
      }

      // call re-calculate auction
      auctionEnd.recalculateAuction(auction, recalculation, function(err) {
        if (err) {
          console.log(err);
          httpStatus = 500;
        }
        else { message = {ok: true}; }
        return cb(httpStatus, message);
      });
    });
  }
};