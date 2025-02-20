// Copyright 2015 - UDS/CNRS
// The Aladin Lite program is distributed under the terms
// of the GNU General Public License version 3.
//
// This file is part of Aladin Lite.
//
//    Aladin Lite is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, version 3 of the License.
//
//    Aladin Lite is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    The GNU General Public License is available in COPYING file
//    along with Aladin Lite.
//



/******************************************************************************
 * Aladin Lite project
 *
 * File Overlay
 *
 * Description: a plane holding overlays (footprints, polylines, circles)
 *
 * Author: Thomas Boch[CDS]
 *
 *****************************************************************************/

import { Utils } from './Utils';
import A from "./A.js";
import { Color } from './Color';

/**
* @typedef {Object} GraphicOverlayOptions
* @description Options for configuring the graphic overlay
*
* @property {Object} options - Configuration options for the MOC.
* @property {string} [options.name="overlay"] - The name of the catalog.
* @property {string} [options.color] - A string parsed as CSS <color> value. See {@link https://developer.mozilla.org/en-US/docs/Web/CSS/color_value| here}
* @property {number} [options.lineWidth=3] - The line width in pixels
* @property {Array.<number>} [options.lineDash=[]] - Dash line option. See the segments property {@link https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/setLineDash#segments| here}
*/

/**
 * Represents an overlay containing Footprints, whether it is 
 *
 * @namespace
 * @typedef {Object} GraphicOverlay
 */
export let GraphicOverlay = (function() {
    /**
     * Constructor function for creating a new graphical overlay instance.
     *
     * @constructor
     * @memberof GraphicOverlay
     * @param {GraphicOverlayOptions} options - Configuration options for the overlay.
     */
   let GraphicOverlay = function(options) {
        options = options || {};

        this.uuid = Utils.uuidv4();
        this.type = 'overlay';

    	this.name = options.name || "overlay";
    	this.color = options.color || Color.getNextColor();

    	this.lineWidth = options["lineWidth"] || 3;
        this.lineDash = options["lineDash"] || [];

    	//this.indexationNorder = 5; // at which level should we index overlays?
    	//this.overlays = [];
    	this.overlayItems = []; // currently Circle or Polyline
    	//this.hpxIdx = new HealpixIndex(this.indexationNorder);
    	//this.hpxIdx.init();

    	this.isShowing = true;
    };


    // TODO : show/hide methods should be integrated in a parent class
    GraphicOverlay.prototype.show = function() {
        if (this.isShowing) {
            return;
        }
        this.isShowing = true;
        // Dispatch to the child shapes
        this.overlayItems.forEach((item) => item.show())

        this.reportChange();
    };

    GraphicOverlay.prototype.hide = function() {
        if (! this.isShowing) {
            return;
        }
        this.isShowing = false;
        // Dispatch to the child shapes
        this.overlayItems.forEach((item) => item.hide())

        this.reportChange();
    };

    GraphicOverlay.prototype.toggle = function() {
        if (! this.isShowing) {
            this.show()
        } else {
            this.hide()
        }
    };

    // return an array of Footprint from a STC-S string
    GraphicOverlay.parseSTCS = function(stcs, options) {
        options = options || {};

        var footprints = [];
        var parts = stcs.match(/\S+/g);
        var k = 0, len = parts.length;
        while(k<len) {
            var s = parts[k].toLowerCase();

            if(s=='polygon') {
                var curPolygon = [];
                k++;
                frame = parts[k].toLowerCase();
                if (Utils.isNumber(frame)) {
                    frame = 'icrs'
                    k--;
                }

                if (frame=='icrs' || frame=='j2000' || frame=='fk5') {
                    while(k+2<len) {
                        var ra = parseFloat(parts[k+1]);
                        if (isNaN(ra)) {
                            break;
                        }
                        var dec = parseFloat(parts[k+2]);
                        curPolygon.push([ra, dec]);
                        k += 2;
                    }

                    options.closed = true;
                    footprints.push(A.polygon(curPolygon, options));
                }
            }
            else if (s=='circle') {
                var frame;
                k++;
                frame = parts[k].toLowerCase();
                if (Utils.isNumber(frame)) {
                    frame = 'icrs'
                    k--;
                }

                if (frame=='icrs' || frame=='j2000' || frame=='fk5') {
                    var ra, dec, radiusDegrees;

                    ra = parseFloat(parts[k+1]);
                    dec = parseFloat(parts[k+2]);
                    radiusDegrees = parseFloat(parts[k+3]);
                    footprints.push(A.circle(ra, dec, radiusDegrees, options));

                    k += 3;
                }
            }

            k++;
        }

        return footprints;
    };

    // ajout d'un tableau d'overlays (= objets Footprint, Circle ou Polyline)
    GraphicOverlay.prototype.addFootprints = function(overlaysToAdd) {
    	for (var k=0, len=overlaysToAdd.length; k<len; k++) {
            this.add(overlaysToAdd[k], false);
        }

        //this.view.requestRedraw();
    };

    // TODO : item doit pouvoir prendre n'importe quoi en param (footprint, circle, polyline)
    GraphicOverlay.prototype.add = function(item, requestRedraw) {
        requestRedraw = requestRedraw !== undefined ? requestRedraw : true;

        //if (item instanceof Footprint) {
        //    this.overlays.push(item);
        //}
        //else {
        this.overlayItems.push(item);
        //}
        item.setOverlay(this);

        if (requestRedraw) {
            this.view.requestRedraw();
        }
    };


    // return a footprint by index
    GraphicOverlay.prototype.getFootprint = function(idx) {
        if (idx<this.footprints.length) {
            return this.footprints[idx];
        }
        else {
            return null;
        }
    };

    GraphicOverlay.prototype.setView = function(view) {
        this.view = view;
    };

    GraphicOverlay.prototype.removeAll = function() {
        // TODO : RAZ de l'index
        //this.overlays = [];
        this.overlayItems = [];
    };

    GraphicOverlay.prototype.draw = function(ctx) {
        if (!this.isShowing) {
            return;
        }

        ctx.save();
        // simple drawing
        ctx.strokeStyle= this.color;
        ctx.lineWidth = this.lineWidth;
        ctx.setLineDash(this.lineDash);

        // 1. Drawing polygons

        // TODO: les overlay polygons devrait se tracer lui meme (methode draw)
        //ctx.lineWidth = this.lineWidth;
    	//ctx.beginPath();
    	/*var xyviews = [];

    	for (var k=0, len = this.overlays.length; k<len; k++) {
    	    xyviews.push(this.drawFootprint(this.overlays[k], ctx, width, height));
    	}*/
        //ctx.stroke();

    	// selection drawing
        /*ctx.strokeStyle= Overlay.increaseBrightness(this.color, 50);
        ctx.beginPath();
        for (var k=0, len = this.overlays.length; k<len; k++) {
            if (this.overlays[k].isSelected) {
                this.drawFootprintSelected(ctx, xyviews[k]);
            }
        }
    	ctx.stroke();*/

        // 2. Circle and polylines drawing
    	for (var k=0; k<this.overlayItems.length; k++) {
    	    this.overlayItems[k].draw(ctx, this.view);
    	}

        ctx.restore();
    };

    GraphicOverlay.increaseBrightness = function(hex, percent){
        // strip the leading # if it's there
        hex = hex.replace(/^\s*#|\s*$/g, '');

        // convert 3 char codes --> 6, e.g. `E0F` --> `EE00FF`
        if(hex.length == 3){
            hex = hex.replace(/(.)/g, '$1$1');
        }

        var r = parseInt(hex.substr(0, 2), 16),
            g = parseInt(hex.substr(2, 2), 16),
            b = parseInt(hex.substr(4, 2), 16);

        return '#' +
                ((0|(1<<8) + r + (256 - r) * percent / 100).toString(16)).substr(1) +
                ((0|(1<<8) + g + (256 - g) * percent / 100).toString(16)).substr(1) +
                ((0|(1<<8) + b + (256 - b) * percent / 100).toString(16)).substr(1);
    };

    GraphicOverlay.prototype.setColor = function(color) {
        this.color = color;
        this.reportChange();
    };

    GraphicOverlay.prototype.setLineWidth = function(lineWidth) {
        this.lineWidth = lineWidth;
        this.reportChange();
    };

    GraphicOverlay.prototype.setLineDash = function(lineDash) {
        this.lineDash = lineDash;
        this.reportChange();
    }

    // callback function to be called when the status of one of the footprints has changed
    GraphicOverlay.prototype.reportChange = function() {
        this.view && this.view.requestRedraw();
    };

    return GraphicOverlay;
})();
