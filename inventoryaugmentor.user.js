// ==UserScript==
// @name			Steam Inventory Augmentor
// @namespace		http://www.doctormckay.com
// @version			1.3.3
// @description		Allows for 1-click marketing and shows duplicate Steam Community items
// @match			http://steamcommunity.com/*/inventory
// @match			http://steamcommunity.com/*/inventory*
// @require			http://ajax.googleapis.com/ajax/libs/jquery/2.0.3/jquery.min.js
// @grant           none
// ==/UserScript==

var dummyEvent = {
    stop: function() {
        // Do nothing!
    }
}

this.$ = this.jQuery = jQuery.noConflict(true);

var activeItem = null;
var activeItemHasButton = false;

$(document).ready(function() {
    setInterval(function() {
        $('.market-one-click-sell').filter(':hidden').remove();

        if((g_ActiveInventory && g_ActiveInventory.selectedItem && g_ActiveInventory.selectedItem != activeItem) || (activeItemHasButton && $('.market-one-click-sell').filter(':visible').length == 0)) {
            activeItem = g_ActiveInventory.selectedItem;
            activeItemHasButton = false;
            itemLoad();
        }
    }, 100);

    console.log("Steam Inventory Augmentor initialized.")
});

function checkDuplicates(inventory) {
    if(inventory.duplicates != null) {
        return inventory.duplicates;
    }

    if(inventory.rgChildInventories) {
        var duplicates = 0;

        for(var id in inventory.rgChildInventories) {
            duplicates += checkDuplicates(inventory.rgChildInventories[id]);
        }

        if(duplicates > 0) {
            inventory.tags.misc.tags.duplicate = {
                count: duplicates,
                internal_name: "duplicate",
                name: "Duplicate"
            };

            rebuildFilters(inventory);
        }

        inventory.duplicates = duplicates;
    } else {
        console.log('Checking duplicates for ' + inventory.appid + '/' + inventory.contextid);

        var classids = [];
        var duplicates = 0;

        var tag = {
            category: "misc",
            category_name: "Misc",
            internal_name: "duplicate",
            name: "Duplicate"
        };

        for(var itemid in inventory.rgInventory) {
            if(classids.indexOf(inventory.rgInventory[itemid].classid) != -1) {
                duplicates++;
                inventory.rgInventory[itemid].tags.push(tag);
            } else {
                classids.push(inventory.rgInventory[itemid].classid);
            }
        }

        if(duplicates > 0) {
            inventory.tags.misc.tags.duplicate = {
                count: duplicates,
                internal_name: "duplicate",
                name: "Duplicate"
            };

            rebuildFilters(inventory);
        }

        inventory.duplicates = duplicates;

        return duplicates;
    }
}

function rebuildFilters(inventory) {
    var id = 'tags_' + inventory.owner.strSteamId + '_' + inventory.appid + '_' + inventory.contextid;
    console.log('Rebuilding filters ' + id);
    var elements = $('[id=' + id + ']');
    if(elements.length > 1) {
        for(var i = 0; i < elements.length - 1; i++) {
            $(elements[i]).remove(); // Clean up Valve's mistakes
        }
    }

    $('#' + id).html('');
    inventory.BuildInventoryTagFilters();
}

function itemLoad() {
    var inventory = g_ActiveInventory;

    checkDuplicates(inventory);

    if(!g_bViewingOwnProfile) {
        return;
    }

    if(!inventory.selectedItem || !inventory.selectedItem.marketable) {
        return;
    }

    $('.market-one-click-sell').remove();

    var button = $('<a class="item_market_action_button item_market_action_button_green market-one-click-sell" style="opacity: 0.5; cursor: default">\
        <span class="item_market_action_button_edge item_market_action_button_left"></span>\
        <span class="item_market_action_button_contents">List Now (...)</span>\
        <span class="item_market_action_button_edge item_market_action_button_right"></span>\
        <span class="item_market_action_button_preload"></span>\
	</a>');

    $('#iteminfo' + iActiveSelectView + '_item_market_actions').append(button);

    var button2;
    if(inventory.selectedItem.commodity) {
        button2 = $('<a class="item_market_action_button item_market_action_button_green market-one-click-sell" style="opacity: 0.5; cursor: default">\
            <span class="item_market_action_button_edge item_market_action_button_left"></span>\
            <span class="item_market_action_button_contents">Sell Now (...)</span>\
            <span class="item_market_action_button_edge item_market_action_button_right"></span>\
            <span class="item_market_action_button_preload"></span>\
            </a>');

        $('#iteminfo' + iActiveSelectView + '_item_market_actions').append(button2);
    }

    $.get('/market/listings/' + inventory.appid + '/' + encodeURIComponent(inventory.selectedItem.market_hash_name), function(data) {
        if(inventory.selectedItem.commodity) {
            var commodityID = data.match(/Market_LoadOrderSpread\(\s?\d+\s?\);/);
            if(!commodityID) {
                button.find('.item_market_action_button_contents').text('List Now (Error)');
                button2.find('.item_market_action_button_contents').text('Sell Now (Error)');
                return;
            }

            commodityID = commodityID[0].match(/\d+/)[0];
            $.get('/market/itemordershistogram', {'country': g_rgWalletInfo.wallet_country, 'language': 'english', 'currency': g_rgWalletInfo.wallet_currency, 'item_nameid': commodityID}, function(json) {
                if(json.success != 1) {
                    button.find('.item_market_action_button_contents').text('List Now (Error)');
                    button2.find('.item_market_action_button_contents').text('Sell Now (Error)');
                    return;
                }

                var publisherFee = typeof inventory.selectedItem.market_fee != 'undefined' ? inventory.selectedItem.market_fee : g_rgWalletInfo['wallet_publisher_fee_percent_default'];
                var feeInfo = CalculateFeeAmount( json.lowest_sell_order, publisherFee );
                var feeInfo2 = CalculateFeeAmount( json.highest_buy_order, publisherFee );

                button.find('.item_market_action_button_contents').html('List Now (' + $.trim(json.price_prefix + ((json.lowest_sell_order - feeInfo.fees) / 100).toFixed(2) + json.price_suffix) + ')');
                button.css('cursor', 'pointer').css('opacity', '1.0');

                if(!json.highest_buy_order) {
                    button2.remove();
                } else {
                    button2.find('.item_market_action_button_contents').html('Sell Now (' + $.trim(json.price_prefix + ((json.highest_buy_order - feeInfo2.fees) / 100).toFixed(2) + json.price_suffix) + ')');
                    button2.css('cursor', 'pointer').css('opacity', '1.0');
                }

                button.click(function() {
                    SellCurrentSelection();
                    $('#market_sell_currency_input').val((json.lowest_sell_order - feeInfo.fees) / 100);
                    $('#market_sell_buyercurrency_input').val(json.lowest_sell_order / 100);
                    $('#market_sell_dialog_accept_ssa').prop('checked', true);
                    SellItemDialog.OnAccept(dummyEvent);
                    SellItemDialog.OnConfirmationAccept(dummyEvent);
                });

                button2.click(function() {
                    SellCurrentSelection();
                    $('#market_sell_currency_input').val((json.highest_buy_order - feeInfo2.fees) / 100);
                    $('#market_sell_buyercurrency_input').val(json.highest_buy_order / 100);
                    $('#market_sell_dialog_accept_ssa').prop('checked', true);
                    SellItemDialog.OnAccept(dummyEvent);
                    SellItemDialog.OnConfirmationAccept(dummyEvent);
                });
            });
        } else {
            var html = $('<div></div>');
            html.append($(data));
            var item = findElementByClass(html, 'div', 'market_listing_row');
            var price = findElementByClass($(item), 'span', 'market_listing_price_with_fee').textContent.trim();
            var pricenofee = findElementByClass($(item), 'span', 'market_listing_price_without_fee').textContent.trim();

            button.find('.item_market_action_button_contents').text('List Now (' + pricenofee + ')');
            button.css('cursor', 'pointer').css('opacity', '1.0');

            button.click(function() {
                SellCurrentSelection();
                $('#market_sell_currency_input').val(pricenofee.replace(/[^0-9.,]/g, ''));
                $('#market_sell_buyercurrency_input').val(price.replace(/[^0-9.,]/g, ''));
                $('#market_sell_dialog_accept_ssa').prop('checked', true);
                SellItemDialog.OnAccept(dummyEvent);
                SellItemDialog.OnConfirmationAccept(dummyEvent);
            });
        }

        activeItemHasButton = true;
    });
}

function findElementByClass(dom, element, classname) {
    var items = dom.find(element);
    for(var i = 0; i < items.length; i++) {
        var classes = items[i].className.split(' ');
        for(var j = 0; j < classes.length; j++) {
            if(classes[j] == classname) {
                if((element == 'div' && $(findElementByClass($(items[i]), 'span', 'market_listing_price_with_fee')).html().indexOf('Sold!') == -1) || element != 'div') {
                    return items[i];
                }
            }
        }
    }
}