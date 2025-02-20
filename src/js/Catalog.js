// Copyright 2013 - UDS/CNRS
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
 * File Catalog
 *
 * Author: Thomas Boch[CDS]
 *
 *****************************************************************************/

import { Source } from "./Source.js";
import { Color } from "./Color.js";
import { Utils } from "./Utils";
import { Coo } from "./libs/astro/coo.js";
import { VOTable } from "./vo/VOTable.js";
import { ObsCore } from "./vo/ObsCore.js";
import A from "./A.js";
import { Polyline } from "./shapes/Polyline.js";
import { Line } from "./shapes/Line.js";
import { Ellipse } from "./shapes/Ellipse.js";
import { Circle } from "./shapes/Circle.js";
import { Footprint } from "./Footprint.js";

/**
 * Represents a catalog with configurable options for display and interaction.
 *
 * @namespace
 * @typedef {Object} Catalog
 */
export let Catalog = (function () {
    /**
     * Constructor function for creating a new catalog instance.
     *
     * @constructor
     * @memberof Catalog
     * @param {Object} options - Configuration options for the catalog.
     * @param {string} options.url - The URL of the catalog.
     * @param {string} [options.name="catalog"] - The name of the catalog.
     * @param {string} [options.color] - The color associated with the catalog.
     * @param {number} [options.sourceSize=8] - The size of the sources in the catalog.
     * @param {string|function|Image|HTMLCanvasElement} [options.shape="square"] - The shape of the sources (can be, "square", "circle", "plus", "cross", "rhomb", "triangle").
     * @param {number} [options.limit] - The maximum number of sources to display.
     * @param {string|Function} [options.onClick] - Whether the source data appears as a table row or a in popup. Can be 'showTable' string, 'showPopup' string or a custom user defined function that handles the click.
     * @param {boolean} [options.readOnly=false] - Whether the catalog is read-only.
     * @param {string} [options.raField] - The ID or name of the field holding Right Ascension (RA).
     * @param {string} [options.decField] - The ID or name of the field holding Declination (dec).
     * @param {function} [options.filter] - The filtering function for sources.
     * @param {string} [options.selectionColor] - The color to apply to selected sources in the catalog.
     * @param {string} [options.hoverColor] - The color to apply to sources in the catalog when they are hovered.
     * @param {boolean} [options.displayLabel=false] - Whether to display labels for sources.
     * @param {string} [options.labelColumn] - The name of the column to be used for the label.
     * @param {string} [options.labelColor] - The color of the source labels.
     * @param {string} [options.labelFont="10px sans-serif"] - The font for the source labels.
     *
     * @example
     * const catalogOptions = {
     *   url: "https://example.com/catalog",
     *   name: "My Catalog",
     *   color: "#ff0000",
     *   sourceSize: 10,
     *   markerSize: 15,
     *   shape: "circle",
     *   limit: 1000,
     *   onClick: (source) => { /* handle source click * },
     *   readOnly: true,
     *   raField: "ra",
     *   decField: "dec",
     *   filter: (source) => source.mag < 15,
     *   selectionColor: "#00ff00",
     *   hoverColor: "#ff00ff",
     *   displayLabel: true,
     *   labelColor: "#00ff00",
     *   labelFont: "12px Arial"
     * };
     * const myCatalog = new Catalog(catalogOptions);
     */
    function Catalog(options) {
        options = options || {};

        this.url = options.url;

        this.name = options.name || "catalog";
        this.color = options.color || Color.getNextColor();
        this.sourceSize = options.sourceSize || 8;
        this.markerSize = options.sourceSize || 12;
        this.selectSize = this.sourceSize;
        this.shape = options.shape || "square";
        this.maxNbSources = options.limit || undefined;
        this.onClick = options.onClick || undefined;
        this.readOnly = options.readOnly || false;

        this.raField = options.raField || undefined; // ID or name of the field holding RA
        this.decField = options.decField || undefined; // ID or name of the field holding dec

        // allows for filtering of sources
        this.filterFn = options.filter || undefined; // TODO: do the same for catalog
        this.selectionColor = options.selectionColor || "#00ff00";
        this.hoverColor = options.hoverColor || this.color;
        this.displayLabel = options.displayLabel || false;
        this.labelColor = options.labelColor || this.color;
        this.labelFont = options.labelFont || "10px sans-serif";
        if (this.displayLabel) {
            this.labelColumn = options.labelColumn;
            if (!this.labelColumn) {
                this.displayLabel = false;
            }
        }

        this.showFieldCallback = {}; // callbacks when the user clicks on a cell in the measurement table associated
        this.fields = undefined;
        this.uuid = Utils.uuidv4();
        this.type = "catalog";

        this.indexationNorder = 5; // à quel niveau indexe-t-on les sources
        this.sources = [];
        this.ra = [];
        this.dec = [];
        this.footprints = [];

        // create this.cacheCanvas
        // cacheCanvas permet de ne créer le path de la source qu'une fois, et de le réutiliser (cf. http://simonsarris.com/blog/427-increasing-performance-by-caching-paths-on-canvas)
        this.updateShape(options);

        this.cacheMarkerCanvas = document.createElement("canvas");
        this.cacheMarkerCanvas.width = this.markerSize;
        this.cacheMarkerCanvas.height = this.markerSize;
        var cacheMarkerCtx = this.cacheMarkerCanvas.getContext("2d");
        cacheMarkerCtx.fillStyle = this.color;
        cacheMarkerCtx.beginPath();
        var half = this.markerSize / 2;
        cacheMarkerCtx.arc(half, half, half - 2, 0, 2 * Math.PI, false);
        cacheMarkerCtx.fill();
        cacheMarkerCtx.lineWidth = 2;
        cacheMarkerCtx.strokeStyle = "#ccc";
        cacheMarkerCtx.stroke();

        this.isShowing = true;
    }

    Catalog.createShape = function (shapeName, color, sourceSize) {
        if (
            shapeName instanceof Image ||
            shapeName instanceof HTMLCanvasElement
        ) {
            // in this case, the shape is already created
            return shapeName;
        }
        var c = document.createElement("canvas");
        c.width = c.height = sourceSize;
        var ctx = c.getContext("2d");
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.0;
        if (shapeName == "plus") {
            ctx.moveTo(sourceSize / 2, 0);
            ctx.lineTo(sourceSize / 2, sourceSize);
            ctx.stroke();

            ctx.moveTo(0, sourceSize / 2);
            ctx.lineTo(sourceSize, sourceSize / 2);
            ctx.stroke();
        } else if (shapeName == "cross") {
            ctx.moveTo(0, 0);
            ctx.lineTo(sourceSize - 1, sourceSize - 1);
            ctx.stroke();

            ctx.moveTo(sourceSize - 1, 0);
            ctx.lineTo(0, sourceSize - 1);
            ctx.stroke();
        } else if (shapeName == "rhomb") {
            ctx.moveTo(sourceSize / 2, 0);
            ctx.lineTo(0, sourceSize / 2);
            ctx.lineTo(sourceSize / 2, sourceSize);
            ctx.lineTo(sourceSize, sourceSize / 2);
            ctx.lineTo(sourceSize / 2, 0);
            ctx.stroke();
        } else if (shapeName == "triangle") {
            ctx.moveTo(sourceSize / 2, 0);
            ctx.lineTo(0, sourceSize - 1);
            ctx.lineTo(sourceSize - 1, sourceSize - 1);
            ctx.lineTo(sourceSize / 2, 0);
            ctx.stroke();
        } else if (shapeName == "circle") {
            ctx.arc(
                sourceSize / 2,
                sourceSize / 2,
                sourceSize / 2 - 1,
                0,
                2 * Math.PI,
                true
            );
            ctx.stroke();
        } else {
            // default shape: square
            ctx.moveTo(1, 0);
            ctx.lineTo(1, sourceSize - 1);
            ctx.lineTo(sourceSize - 1, sourceSize - 1);
            ctx.lineTo(sourceSize - 1, 1);
            ctx.lineTo(1, 1);
            ctx.stroke();
        }

        return c;
    };

    // find RA, Dec fields among the given fields
    //
    // @param fields: list of objects with ucd, unit, ID, name attributes
    // @param raField:  index or name of right ascension column (might be undefined)
    // @param decField: index or name of declination column (might be undefined)
    //
    function findRADecFields(fields, raField, decField) {
        var raFieldIdx, decFieldIdx;
        raFieldIdx = decFieldIdx = null;

        // first, look if RA/DEC fields have been already given
        if (raField) {
            // ID or name of RA field given at catalogue creation
            for (var l = 0, len = fields.length; l < len; l++) {
                var field = fields[l];
                if (Utils.isInt(raField) && raField < fields.length) {
                    // raField can be given as an index
                    raFieldIdx = raField;
                    break;
                }
                if (
                    (field.ID && field.ID === raField) ||
                    (field.name && field.name === raField)
                ) {
                    raFieldIdx = l;
                    break;
                }
            }
        }
        if (decField) {
            // ID or name of dec field given at catalogue creation
            for (var l = 0, len = fields.length; l < len; l++) {
                var field = fields[l];
                if (Utils.isInt(decField) && decField < fields.length) {
                    // decField can be given as an index
                    decFieldIdx = decField;
                    break;
                }
                if (
                    (field.ID && field.ID === decField) ||
                    (field.name && field.name === decField)
                ) {
                    decFieldIdx = l;
                    break;
                }
            }
        }
        // if not already given, let's guess position columns on the basis of UCDs
        for (var l = 0, len = fields.length; l < len; l++) {
            if (raFieldIdx != null && decFieldIdx != null) {
                break;
            }

            var field = fields[l];
            if (!raFieldIdx) {
                if (field.ucd) {
                    var ucd = field.ucd.toLowerCase().trim();
                    if (
                        ucd.indexOf("pos.eq.ra") == 0 ||
                        ucd.indexOf("pos_eq_ra") == 0
                    ) {
                        raFieldIdx = l;
                        continue;
                    }
                }
            }

            if (!decFieldIdx) {
                if (field.ucd) {
                    var ucd = field.ucd.toLowerCase().trim();
                    if (
                        ucd.indexOf("pos.eq.dec") == 0 ||
                        ucd.indexOf("pos_eq_dec") == 0
                    ) {
                        decFieldIdx = l;
                        continue;
                    }
                }
            }
        }

        // still not found ? try some common names for RA and Dec columns
        if (raFieldIdx == null && decFieldIdx == null) {
            for (var l = 0, len = fields.length; l < len; l++) {
                var field = fields[l];
                var name = field.name || field.ID || "";
                name = name.toLowerCase();

                if (raFieldIdx === null) {
                    if (
                        name.indexOf("ra") == 0 ||
                        name.indexOf("_ra") == 0 ||
                        name.indexOf("ra(icrs)") == 0 ||
                        name.indexOf("alpha") == 0
                    ) {
                        raFieldIdx = l;
                        continue;
                    }
                }

                if (decFieldIdx === null) {
                    if (
                        name.indexOf("dej2000") == 0 ||
                        name.indexOf("_dej2000") == 0 ||
                        name.indexOf("de") == 0 ||
                        name.indexOf("de(icrs)") == 0 ||
                        name.indexOf("_de") == 0 ||
                        name.indexOf("delta") == 0
                    ) {
                        decFieldIdx = l;
                        continue;
                    }
                }
            }
        }

        // last resort: take two first fieds
        if (raFieldIdx == null || decFieldIdx == null) {
            raFieldIdx = 0;
            decFieldIdx = 1;
        }

        return [raFieldIdx, decFieldIdx];
    }

    Catalog.parseFields = function (fields, raField, decField) {
        // This votable is not an obscore one
        let [raFieldIdx, decFieldIdx] = findRADecFields(
            fields,
            raField,
            decField
        );
        let parsedFields = {};
        let fieldIdx = 0;
        fields.forEach((field) => {
            let key = field.name ? field.name : field.ID;

            key = key.split(" ").join("_");

            let nameField;
            if (fieldIdx == raFieldIdx) {
                nameField = "ra";
            } else if (fieldIdx == decFieldIdx) {
                nameField = "dec";
            } else {
                nameField = key;
            }

            // remove the space character
            parsedFields[nameField] = {
                name: key,
                idx: fieldIdx,
            };

            fieldIdx++;
        });

        return parsedFields;
    };

    // return an array of Source(s) from a VOTable url
    // callback function is called each time a TABLE element has been parsed
    Catalog.parseVOTable = function (
        url,
        successCallback,
        errorCallback,
        maxNbSources,
        useProxy,
        raField,
        decField
    ) {
        let rowIdx = 0;
        new VOTable(
            url,
            (rsc) => {
                let table = VOTable.parseRsc(rsc);
                if (!table || !table.rows || !table.fields) {
                    errorCallback(
                        "Parsing error of the votable located at: " + url
                    );
                    return;
                }

                let { fields, rows } = table;
                try {
                    fields = ObsCore.parseFields(fields);
                    //fields.subtype = "ObsCore";
                } catch (e) {
                    // It is not an ObsCore table
                    fields = Catalog.parseFields(fields, raField, decField);
                }

                let sources = [];
                //let footprints = [];

                var coo = new Coo();

                rows.every((row) => {
                    let ra, dec, region;
                    var mesures = {};

                    for (const [fieldName, field] of Object.entries(fields)) {
                        if (fieldName === "s_region") {
                            // Obscore s_region param
                            region = row[field.idx];
                        } else if (fieldName === "ra" || fieldName === "s_ra") {
                            ra = row[field.idx];
                        } else if (
                            fieldName === "dec" ||
                            fieldName === "s_dec"
                        ) {
                            dec = row[field.idx];
                        }

                        var key = field.name;
                        mesures[key] = row[field.idx];
                    }

                    let source = null;
                    if (ra !== undefined && ra !== null && dec !== undefined && dec !== null) {
                        if (!Utils.isNumber(ra) || !Utils.isNumber(dec)) {
                            coo.parse(ra + " " + dec);
                            ra = coo.lon;
                            dec = coo.lat;
                        }

                        source = new Source(
                            parseFloat(ra),
                            parseFloat(dec),
                            mesures
                        );
                        source.rowIdx = rowIdx;

                        sources.push(source);
                        if (maxNbSources && sources.length == maxNbSources) {
                            return false;
                        }
                    }

                    rowIdx++;
                    return true;
                });

                if (successCallback) {
                    successCallback({
                        sources,
                        //footprints,
                        fields,
                    });
                }
            },
            errorCallback,
            useProxy,
            raField,
            decField
        );
    };

    // API
    Catalog.prototype.updateShape = function (options) {
        options = options || {};
        this.color = options.color || this.color || Color.getNextColor();
        this.sourceSize = options.sourceSize || this.sourceSize || 6;
        this.shape = options.shape || this.shape || "square";

        this._shapeIsFunction = false; // if true, the shape is a function drawing on the canvas
        this._shapeIsFootprintFunction = false;
        if (typeof this.shape === "function") {
            this._shapeIsFunction = true;
            // do not need to compute any canvas

            // there is a possibility that the user gives a function returning shape objects such as
            // circle, polyline, line or even footprints
            // we must test that here and precompute all those objects and add them as footprints to draw
            // at this point, we do not have to draw any sources
        } else if (
            this.shape instanceof Image ||
            this.shape instanceof HTMLCanvasElement
        ) {
            this.sourceSize = this.shape.width;
        }

        this.selectSize = this.sourceSize + 2;

        this.cacheCanvas = Catalog.createShape(
            this.shape,
            this.color,
            this.sourceSize
        );
        this.cacheSelectCanvas = Catalog.createShape(
            this.shape,
            this.selectionColor,
            this.selectSize
        );
        this.cacheHoverCanvas = Catalog.createShape(
            this.shape,
            this.hoverColor,
            this.selectSize
        );

        this.reportChange();
    };

    // API
    Catalog.prototype.addSources = function (sources) {
        // make sure we have an array and not an individual source
        sources = [].concat(sources);

        if (sources.length === 0) {
            return;
        }

        if (!this.fields) {
            // Case where we create a catalog from scratch
            // We have to define its fields by looking at the source data
            let fields = [];
            for (var key in sources[0].data) {
                fields.push({ name: key });
            }

            fields = Catalog.parseFields(fields, this.raField, this.decField);
            this.setFields(fields);
        }

        this.sources = this.sources.concat(sources);
        for (var k = 0, len = sources.length; k < len; k++) {
            sources[k].setCatalog(this);

            // Create columns oriented ra and dec
            this.ra.push(sources[k].ra);
            this.dec.push(sources[k].dec);
        }

        this.recomputeFootprints = true;

        this.reportChange();
    };

    /*Catalog.prototype.addFootprints = function(footprintsToAdd) {
        footprintsToAdd = [].concat(footprintsToAdd); // make sure we have an array and not an individual footprints
    	this.footprints = this.footprints.concat(footprintsToAdd);

        footprintsToAdd.forEach(f => {
            f.setCatalog(this);
        })

        this.reportChange();
    };*/

    Catalog.prototype.computeFootprints = function (sources) {
        let footprints = [];

        if (this._shapeIsFunction) {
            for (const source of sources) {
                try {
                    let shape = this.shape(source);

                    // convert simple shapes to footprints
                    if (
                        shape instanceof Circle ||
                        shape instanceof Polyline ||
                        shape instanceof Ellipse ||
                        shape instanceof Line
                    ) {
                        shape = new Footprint(shape, source);
                    }

                    if (shape instanceof Footprint) {
                        let footprint = shape;
                        this._shapeIsFootprintFunction = true;
                        footprint.setCatalog(this);

                        // store the footprints
                        footprints.push(footprint);
                    }
                } catch (e) {
                    // do not create the footprint
                    continue;
                }
            }
        }

        return footprints;
    };

    Catalog.prototype.setFields = function (fields) {
        this.fields = fields;
    };

    /// This add a callback when the user clicks on the field column in the measurementTable
    Catalog.prototype.addShowFieldCallback = function (field, callback) {
        this.showFieldCallback[field] = callback;
    };

    // API
    //
    // create sources from a 2d array and add them to the catalog
    //
    // @param columnNames: array with names of the columns
    // @array: 2D-array, each item being a 1d-array with the same number of items as columnNames
    Catalog.prototype.addSourcesAsArray = function (columnNames, array) {
        var fields = [];
        for (var colIdx = 0; colIdx < columnNames.length; colIdx++) {
            fields.push({ name: columnNames[colIdx] });
        }

        fields = Catalog.parseFields(fields, this.raField, this.decField);
        this.setFields(fields);

        var raFieldIdx, decFieldIdx;
        raFieldIdx = fields["ra"].idx;
        decFieldIdx = fields["dec"].idx;

        var newSources = [];
        var coo = new Coo();
        var ra, dec, row, dataDict;
        for (var rowIdx = 0; rowIdx < array.length; rowIdx++) {
            row = array[rowIdx];
            if (
                Utils.isNumber(row[raFieldIdx]) &&
                Utils.isNumber(row[decFieldIdx])
            ) {
                ra = parseFloat(row[raFieldIdx]);
                dec = parseFloat(row[decFieldIdx]);
            } else {
                coo.parse(row[raFieldIdx] + " " + row[decFieldIdx]);
                ra = coo.lon;
                dec = coo.lat;
            }

            dataDict = {};
            for (var colIdx = 0; colIdx < columnNames.length; colIdx++) {
                dataDict[columnNames[colIdx]] = row[colIdx];
            }

            newSources.push(A.source(ra, dec, dataDict));
        }

        this.addSources(newSources);
    };

    // return the current list of Source objects
    Catalog.prototype.getSources = function () {
        return this.sources;
    };

    Catalog.prototype.getFootprints = function () {
        return this.footprints;
    };

    // TODO : fonction générique traversant la liste des sources
    Catalog.prototype.selectAll = function () {
        if (!this.sources) {
            return;
        }

        for (var k = 0; k < this.sources.length; k++) {
            this.sources[k].select();
        }
    };

    Catalog.prototype.deselectAll = function () {
        if (!this.sources) {
            return;
        }

        for (var k = 0; k < this.sources.length; k++) {
            this.sources[k].deselect();
        }
    };

    // return a source by index
    Catalog.prototype.getSource = function (idx) {
        if (idx < this.sources.length) {
            return this.sources[idx];
        } else {
            return null;
        }
    };

    Catalog.prototype.setView = function (view) {
        this.view = view;
        this.reportChange();
    };

    Catalog.prototype.setColor = function (color) {
        this.color = color;
        this.updateShape();
    };

    Catalog.prototype.setSelectionColor = function (color) {
        this.selectionColor = color;
        this.updateShape();
    };

    Catalog.prototype.setHoverColor = function (color) {
        this.hoverColor = color;
        this.updateShape();
    };

    Catalog.prototype.setSourceSize = function (sourceSize) {
        // will be discarded in updateShape if the shape is an Image
        this.sourceSize = sourceSize;
        this.updateShape();
    };

    Catalog.prototype.setShape = function (shape) {
        this.shape = shape;
        this.updateShape();
    };

    Catalog.prototype.getSourceSize = function () {
        return this.sourceSize;
    };

    // remove a source
    Catalog.prototype.remove = function (source) {
        var idx = this.sources.indexOf(source);
        if (idx < 0) {
            return;
        }

        this.sources[idx].deselect();
        this.sources.splice(idx, 1);

        this.ra.splice(idx, 1);
        this.dec.splice(idx, 1);

        this.recomputeFootprints = true;

        this.reportChange();
    };

    Catalog.prototype.removeAll = Catalog.prototype.clear = function () {
        // TODO : RAZ de l'index
        this.sources = [];
        this.ra = [];
        this.dec = [];
        this.footprints = [];
    };

    Catalog.prototype.draw = function (ctx, width, height) {
        if (!this.isShowing) {
            return;
        }
        // tracé simple
        ctx.strokeStyle = this.color;

        // Draw the footprints first
        this.drawFootprints(ctx);

        if (this._shapeIsFunction) {
            ctx.save();
        }

        const drawnSources = this.drawSources(ctx, width, height);

        if (this._shapeIsFunction) {
            ctx.restore();
        }

        // Draw labels
        if (this.displayLabel) {
            ctx.fillStyle = this.labelColor;
            ctx.font = this.labelFont;
            drawnSources.forEach((s) => {
                this.drawSourceLabel(s, ctx);
            });
        }
    };

    Catalog.prototype.drawSources = function (ctx, width, height) {
        let inside = [];

        if (!this.sources) {
            return;
        }

        let xy = this.view.wasm.worldToScreenVec(this.ra, this.dec);

        let self = this;
        this.sources.forEach(function (s, idx) {
            if (xy[2 * idx] && xy[2 * idx + 1]) {
                if (!self.filterFn || self.filterFn(s)) {
                    s.x = xy[2 * idx];
                    s.y = xy[2 * idx + 1];

                    self.drawSource(s, ctx, width, height);
                    inside.push(s);
                }
            }
        });

        return inside;
    };

    Catalog.prototype.drawSource = function (s, ctx, width, height) {
        if (!s.isShowing) {
            return false;
        }

        if (s.hasFootprint && !s.tooSmallFootprint) {
            return false;
        }

        if (s.x <= width && s.x >= 0 && s.y <= height && s.y >= 0) {
            if (this._shapeIsFunction && !this._shapeIsFootprintFunction) {
                this.shape(s, ctx, this.view.getViewParams());
            } else if (s.marker && s.useMarkerDefaultIcon) {
                ctx.drawImage(
                    this.cacheMarkerCanvas,
                    s.x - this.sourceSize / 2,
                    s.y - this.sourceSize / 2
                );
            } else if (s.isSelected) {
                ctx.drawImage(
                    this.cacheSelectCanvas,
                    s.x - this.selectSize / 2,
                    s.y - this.selectSize / 2
                );
            } else if (s.isHovered) {
                ctx.drawImage(
                    this.cacheHoverCanvas,
                    s.x - this.selectSize / 2,
                    s.y - this.selectSize / 2
                );
            } else {
                ctx.drawImage(
                    this.cacheCanvas,
                    s.x - this.cacheCanvas.width / 2,
                    s.y - this.cacheCanvas.height / 2
                );
            }

            // has associated popup ?
            if (s.popup) {
                s.popup.setPosition(s.x, s.y);
            }

            return true;
        }

        return false;
    };

    Catalog.prototype.drawSourceLabel = function (s, ctx) {
        if (!s || !s.isShowing || !s.x || !s.y) {
            return;
        }

        var label = s.data[this.labelColumn];
        if (!label) {
            return;
        }

        ctx.fillText(label, s.x, s.y);
    };

    Catalog.prototype.drawFootprints = function (ctx) {
        if (this.recomputeFootprints) {
            this.footprints = this.computeFootprints(this.sources);
            this.recomputeFootprints = false;
        }

        var f;
        for (let k = 0; k < this.footprints.length; k++) {
            f = this.footprints[k];

            f.draw(ctx, this.view);
            f.source.tooSmallFootprint = f.isTooSmall();
            // propagate the info that the footprint is too small
            //f.source.tooSmallFootprint = f.isTooSmall
        }
    };

    // callback function to be called when the status of one of the sources has changed
    Catalog.prototype.reportChange = function () {
        this.view && this.view.requestRedraw();
    };

    Catalog.prototype.show = function () {
        if (this.isShowing) {
            return;
        }
        this.isShowing = true;
        // Dispatch to the footprints
        if (this.footprints) {
            this.footprints.forEach((f) => f.show());
        }

        this.reportChange();
    };

    Catalog.prototype.hide = function () {
        if (!this.isShowing) {
            return;
        }
        this.isShowing = false;
        if (
            this.view &&
            this.view.popup &&
            this.view.popup.source &&
            this.view.popup.source.catalog == this
        ) {
            this.view.popup.hide();
        }
        // Dispatch to the footprints
        if (this.footprints) {
            this.footprints.forEach((f) => f.hide());
        }

        this.reportChange();
    };

    return Catalog;
})();
