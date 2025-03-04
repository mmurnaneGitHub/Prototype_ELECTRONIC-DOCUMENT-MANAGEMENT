///////////////////////////////////////////////////////////////////////////
// Copyright © Esri. All Rights Reserved.
//
// Licensed under the Apache License Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
///////////////////////////////////////////////////////////////////////////

define([
  'dojo/_base/declare',
  'dijit/_WidgetsInTemplateMixin',
  'jimu/BaseWidget',
  'dojo/on',
  'dojo/keys',
  'dojo/Deferred',
  // 'dojo/number',
  'dojo/i18n',
  'dojo/i18n!esri/nls/jsapi',
  'dojo/_base/html',
  'dojo/_base/lang',
  // 'dojo/_base/Color',
  'dojo/_base/array',
  'dojo/dom-style',
  'esri/config',
  'esri/graphic',
  'esri/geometry/Polyline',
  'esri/geometry/Polygon',
  'esri/symbols/TextSymbol',
  'esri/symbols/Font',
  'esri/units',
  'esri/geometry/webMercatorUtils',
  'esri/tasks/ProjectParameters',
  'esri/SpatialReference',
  'esri/request',
  'esri/geometry/geodesicUtils',
  'esri/tasks/GeometryService',
  'esri/tasks/AreasAndLengthsParameters',
  'esri/tasks/LengthsParameters',
  'esri/undoManager',
  'esri/OperationBase',
  'esri/layers/GraphicsLayer',
  'esri/layers/FeatureLayer',
  'jimu/dijit/ViewStack',
  'jimu/utils',
  'jimu/dijit/ToggleButton',
  'jimu/SpatialReference/wkidUtils',
  'jimu/LayerInfos/LayerInfos',
  'jimu/dijit/LoadingIndicator',
  'jimu/dijit/DrawBox',
  'jimu/dijit/SymbolChooser',
  'jimu/dijit/ColorPicker',
  'jimu/dijit/formSelect',
  'dijit/form/NumberSpinner'
],
  function (declare, _WidgetsInTemplateMixin, BaseWidget, on, keys, Deferred, dojoI18n, esriNlsBundle,
    html, lang, array, domStyle,
    esriConfig, Graphic, Polyline, Polygon, TextSymbol, Font, esriUnits, webMercatorUtils,
    EsriProjectParameters,
    EsriSpatialReference,
    EsriRequest,
    geodesicUtils, GeometryService, AreasAndLengthsParameters, LengthsParameters, UndoManager,
    OperationBase, GraphicsLayer, FeatureLayer, ViewStack, jimuUtils, ToggleButton, wkidUtils, LayerInfos,
    LoadingIndicator) {
    //custom operations
    var customOp = {};
    customOp.Add = declare(OperationBase, {
      label: 'Add Graphic',
      constructor: function (/*graphicsLayer, addedGraphics*/ params) {
        this._graphicsLayer = params.graphicsLayer;
        this._addedGraphics = params.addedGraphics;
      },

      performUndo: function () {
        array.forEach(this._addedGraphics, lang.hitch(this, function (g) {
          this._graphicsLayer.remove(g);
        }));
      },

      performRedo: function () {
        array.forEach(this._addedGraphics, lang.hitch(this, function (g) {
          this._graphicsLayer.add(g);
        }));
      }
    });
    customOp.Delete = declare(OperationBase, {
      label: 'Delete Graphic',
      constructor: function (/*graphicsLayer, deletedGraphics*/ params) {
        this._graphicsLayer = params.graphicsLayer;
        this._deletedGraphics = params.deletedGraphics;
      },

      performUndo: function () {
        array.forEach(this._deletedGraphics, lang.hitch(this, function (g) {
          this._graphicsLayer.add(g);
        }));
      },

      performRedo: function () {
        array.forEach(this._deletedGraphics, lang.hitch(this, function (g) {
          this._graphicsLayer.remove(g);
        }));
      }
    });

    return declare([BaseWidget, _WidgetsInTemplateMixin], {
      name: 'Draw',
      baseClass: 'jimu-widget-draw',
      _gs: null,
      _defaultGsUrl: '//tasks.arcgisonline.com/ArcGIS/rest/services/Geometry/GeometryServer',
      _undoManager: null,
      _graphicsLayer: null,
      _objectIdCounter: 1,
      _objectIdName: 'OBJECTID',
      _objectIdType: 'esriFieldTypeOID',
      _pointLayer: null,
      _polylineLayer: null,
      _polygonLayer: null,
      _labelLayer: null,

      _existLocationUnits: true,//if location units exist in config
      _existDistanceUnits: true,
      _existAreaUnits: true,

      postMixInProperties: function () {
        this.inherited(arguments);
        this.isRenderIdForAttrs = true;
        this.jimuNls = window.jimuNls;
        this.config.isOperationalLayer = !!this.config.isOperationalLayer;
        //point locale decimal
        this.numberDecimal = dojoI18n.getLocalization("dojo.cldr", "number", window.dojoConfig.locale).decimal;

        if (esriConfig.defaults.geometryService) {
          this._gs = esriConfig.defaults.geometryService;
        } else {
          this._gs = new GeometryService(this._defaultGsUrl);
        }

        this._resetUnitsArrays();
        this._undoManager = new UndoManager({
          maxOperations: 0
        });
      },

      postCreate: function () {
        this.inherited(arguments);
        this._initGraphicsLayers();
        // jimuUtils.combineRadioCheckBoxWithLabel(this.showMeasure, this.showMeasureLabel);
        this.drawBox.setMap(this.map);

        this.viewStack = new ViewStack({
          viewType: 'dom',
          views: [this.pointSection, this.lineSection, this.polygonSection, this.textSection]
        });
        html.place(this.viewStack.domNode, this.settingContent);

        this._initUnitSelect();
        this._initToggleUnits();
        this._bindEvents();
        //let all buttons disable-like
        this._enableBtn(this.btnUndo, false);
        this._enableBtn(this.btnRedo, false);
        this._enableBtn(this.btnClear, false);

        this.saveDrawToolTips();

        this._addCoordinateSection(); //MJM - Add Coordinates section to panel 
      },

      _addCoordinateSection: function () { //MJM - Add Coordinates section to panel
        var x = document.createElement("BUTTON");
        var t = document.createTextNode("Copy coordinates to clipboard");
        x.id = 'coordsButton';  //Use to find later
        x.onclick = this._copy2Clipboard;
        x.appendChild(t);
        this.domNode.appendChild(x);  //place after last child node		

        var x = document.createElement("TEXTAREA");
        x.id = 'coordsTextAreaDRAW';  //Use to find later
        x.style.margin = '5px';
        x.style.width = '90%';
        x.style.height = '200px';
        this.domNode.appendChild(x);  //place after last child node
      },

      //save original toolbar's tips
      saveDrawToolTips: function () {
        this._defaultStartStr = esriNlsBundle.toolbars.draw.start;
        this._defaultAddPointStr = esriNlsBundle.toolbars.draw.addPoint;
        this._defaultAddShapeStr = esriNlsBundle.toolbars.draw.addShape;
        this._defaultFreehandStr = esriNlsBundle.toolbars.draw.freehand;

        this.suffixStr = '';
        if (this.map.snappingManager) {
          this.suffixStr = "<br/>" + "(" + this.jimuNls.snapping.pressStr + "<b>" +
            this.jimuNls.snapping.ctrlStr + "</b> " +
            this.jimuNls.snapping.snapStr + ")";
        }
      },

      customDrawToolTips: function () {
        esriNlsBundle.toolbars.draw.start = this._defaultStartStr + this.suffixStr;
        esriNlsBundle.toolbars.draw.addPoint = this._defaultAddPointStr + this.suffixStr;
        esriNlsBundle.toolbars.draw.addShape = this._defaultAddShapeStr + this.suffixStr;
        esriNlsBundle.toolbars.draw.freehand = this._defaultFreehandStr + this.suffixStr;
      },

      resetDrawToolTips: function () {
        esriNlsBundle.toolbars.draw.start = this._defaultStartStr;
        esriNlsBundle.toolbars.draw.addPoint = this._defaultAddPointStr;
        esriNlsBundle.toolbars.draw.addShape = this._defaultAddShapeStr;
        esriNlsBundle.toolbars.draw.freehand = this._defaultFreehandStr;
      },

      _initGraphicsLayers: function () {
        this._graphicsLayer = new GraphicsLayer();
        if (!this.config.isOperationalLayer) {
          this._pointLayer = new GraphicsLayer();
          this._polylineLayer = new GraphicsLayer();
          this._polygonLayer = new GraphicsLayer();
          this._labelLayer = new GraphicsLayer();
          this.map.addLayer(this._polygonLayer);
          this.map.addLayer(this._polylineLayer);
          this.map.addLayer(this._pointLayer);
          this.map.addLayer(this._labelLayer);
        }
      },

      _removeEmptyLayers: function () {
        if (this._pointLayer && this._pointLayer.graphics.length === 0) {
          this.map.removeLayer(this._pointLayer);
          this._pointLayer = null;
        }
        if (this._polylineLayer && this._polylineLayer.graphics.length === 0) {
          this.map.removeLayer(this._polylineLayer);
          this._polylineLayer = null;
        }
        if (this._polygonLayer && this._polygonLayer.graphics.length === 0) {
          this.map.removeLayer(this._polygonLayer);
          this._polygonLayer = null;
        }
        if (this._labelLayer && this._labelLayer.graphics.length === 0) {
          this.map.removeLayer(this._labelLayer);
          this._labelLayer = null;
        }
      },

      onDeActive: function () {
        this._closeColorPicker();
        this.drawBox.deactivate();
      },

      onOpen: function () {
        this.customDrawToolTips();
      },

      onClose: function () {
        this.resetDrawToolTips();
        this._closeColorPicker();
        if (this.config.isOperationalLayer) {
          this._removeEmptyLayers();
        }
      },

      _closeColorPicker: function () {
        var choosers = ["pointSymChooser", "lineSymChooser", "fillSymChooser", "textSymChooser"];
        for (var i = 0, len = choosers.length; i < len; i++) {
          var chooserStr = choosers[i];
          if (this[chooserStr]) {
            this[chooserStr].hideColorPicker();
          }
        }
      },

      _resetUnitsArrays: function () {
        this.defaultLocationUnits = [];
        this.defaultDistanceUnits = [];
        this.defaultAreaUnits = [];
        this.configLocationUnits = [];
        this.configDistanceUnits = [];
        this.configAreaUnits = [];
        this.locationUnits = [];
        this.distanceUnits = [];
        this.areaUnits = [];
      },

      _bindEvents: function () {
        //init first focusable node
        // jimuUtils.initFirstFocusNode(this.domNode, this.drawBox.pointIcon);

        //bind DrawBox
        this.own(on(this.drawBox, 'icon-selected', lang.hitch(this, this._onIconSelected)));
        this.own(on(this.drawBox, 'DrawEnd', lang.hitch(this, this._onDrawEnd)));

        //bind symbol change events
        this.own(on(this.pointSymChooser, 'change', lang.hitch(this, function () {
          this._setDrawDefaultSymbols();
        })));
        this.own(on(this.lineSymChooser, 'change', lang.hitch(this, function () {
          this._setDrawDefaultSymbols();
        })));
        this.own(on(this.fillSymChooser, 'change', lang.hitch(this, function () {
          this._setDrawDefaultSymbols();
        })));
        this.own(on(this.textSymChooser, 'change', lang.hitch(this, function (symbol) {
          this.drawBox.setTextSymbol(symbol);
        })));

        //bind unit events
        // this.own(on(this.showMeasure, 'click', lang.hitch(this, this._setMeasureVisibility)));

        //bind UndoManager events
        this.own(on(this._undoManager, 'change', lang.hitch(this, this._onUndoManagerChanged)));
      },

      _onIconSelected: function (target, geotype, commontype) {
        /*jshint unused: false*/
        this._setDrawDefaultSymbols();
        if (this.config.isOperationalLayer) {
          this._checkOperateLayers(commontype);
        }
        if (commontype === 'point') {
          this.viewStack.switchView(this.pointSection);
        }
        else if (commontype === 'polyline') {
          this.viewStack.switchView(this.lineSection);
        }
        else if (commontype === 'polygon') {
          this.viewStack.switchView(this.polygonSection);
        }
        else if (commontype === 'text') {
          this.viewStack.switchView(this.textSection);
        }
        this._setMeasureVisibility();
      },

      //graphics's label use the same labelLayer as text draw mode
      _checkTextOperateLayer: function () {
        if (!this._labelLayer) {
          this._checkOperateLayers('text');
        }
      },

      _checkOperateLayers: function (type) {
        var definition = {
          "name": "",
          "geometryType": "",
          "fields": [{
            "name": this._objectIdName,
            "type": this._objectIdType,
            "alias": this._objectIdName
          }]
        };
        var layer = null;
        var layerDefinition = lang.clone(definition);
        if (type === 'point' && !this._pointLayer) {
          layerDefinition.name = this.nls.points;
          layerDefinition.geometryType = "esriGeometryPoint";
          layer = this._getFeatureLayer(layerDefinition);
          this._pointLayer = layer;
        } else if (type === 'polyline' && !this._polylineLayer) {
          layerDefinition.name = this.nls.lines;
          layerDefinition.geometryType = "esriGeometryPolyline";
          layer = this._getFeatureLayer(layerDefinition);
          this._polylineLayer = layer;
        } else if (type === 'polygon' && !this._polygonLayer) {
          layerDefinition.name = this.nls.areas;
          layerDefinition.geometryType = "esriGeometryPolygon";
          layer = this._getFeatureLayer(layerDefinition);
          this._polygonLayer = layer;
        } else if (type === 'text' && !this._labelLayer) {
          layerDefinition.name = this.nls.text;
          layerDefinition.geometryType = "esriGeometryPoint";
          layer = this._getFeatureLayer(layerDefinition);
          this._labelLayer = layer;
        }
        if (layer) {
          this._addLayerFromLayerInfos(layer);
        }
      },

      _getFeatureLayer: function (labelDefinition) {
        return new FeatureLayer({
          layerDefinition: labelDefinition,
          featureSet: null
        });
      },

      _addLayerFromLayerInfos: function (layer) {
        var loading = new LoadingIndicator();
        loading.placeAt(this.domNode);
        LayerInfos.getInstance(this.map, this.map.itemInfo)
          .then(lang.hitch(this, function (layerInfos) {
            if (!this.domNode) {
              return;
            }
            loading.destroy();
            layerInfos.addFeatureCollection([layer], this.label + "_" + layer.name);
          }), lang.hitch(this, function (err) {
            loading.destroy();
            console.error("Can not get LayerInfos instance", err);
          }));
      },

      _onDrawEnd: function (graphic, geotype, commontype) {
        /*jshint unused: false*/
        this.drawBox.clear();

        var geometry = graphic.geometry;
        if (geometry.type === 'extent') {
          var a = geometry;
          var polygon = new Polygon(a.spatialReference);
          var r = [
            [a.xmin, a.ymin],
            [a.xmin, a.ymax],
            [a.xmax, a.ymax],
            [a.xmax, a.ymin],
            [a.xmin, a.ymin]
          ];
          polygon.addRing(r);
          geometry = polygon;
          commontype = 'polygon';
        }
        var disApplied = html.hasClass(this.distanceMeasureHeader, 'applied');
        if (commontype === 'polyline') {
          if (disApplied) {
            this._checkTextOperateLayer();
            this._addLineMeasure(geometry, graphic);
          } else {
            this._pushAddOperation([graphic]);
          }
        }
        else if (commontype === 'polygon') {
          var areaApplied = html.hasClass(this.areaMeasureHeader, 'applied');
          if (disApplied || areaApplied) {
            this._checkTextOperateLayer();
            this._addPolygonMeasure(geometry, graphic, areaApplied, disApplied);
          } else {
            this._pushAddOperation([graphic]);
          }
        }
        else if (commontype === "text") {
          if (graphic.symbol && graphic.symbol.font && graphic.symbol.font.setFamily) {
            graphic.symbol.font.setFamily("Arial Unicode MS");//set font-family for print unicode,#11085
          }
          this._pushAddOperation([graphic]);
        } else { //location
          disApplied = html.hasClass(this.locationMeasureHeader, 'applied');
          if (disApplied) {
            this._checkTextOperateLayer();
            this._addLocationMeasure(geometry, graphic);
          }
          this._pushAddOperation([graphic]);
        }
      },

      _initUnitSelect: function () {
        this._initDefaultUnits();
        this._initConfigUnits();
        //show or hide "Show ... measurement" modals
        this.locationUnits = this.configLocationUnits;
        this.distanceUnits = this.configDistanceUnits;
        this.areaUnits = this.configAreaUnits;
        this._existLocationUnits = this.locationUnits.length > 0 ? true : false;
        this._existDistanceUnits = this.distanceUnits.length > 0 ? true : false;
        this._existAreaUnits = this.areaUnits.length > 0 ? true : false;
        array.forEach(this.locationUnits, lang.hitch(this, function (unitInfo) {
          var option = {
            value: unitInfo.unit,
            label: unitInfo.label
          };
          this.locationUnitSelect.addOption(option);
        }));

        array.forEach(this.distanceUnits, lang.hitch(this, function (unitInfo) {
          var option = {
            value: unitInfo.unit,
            label: unitInfo.label
          };
          this.distanceUnitSelect.addOption(option);
        }));

        array.forEach(this.areaUnits, lang.hitch(this, function (unitInfo) {
          var option = {
            value: unitInfo.unit,
            label: unitInfo.label
          };
          this.areaUnitSelect.addOption(option);
        }));
      },

      _initDefaultUnits: function () {
        this.defaultLocationUnits = [{
          unit: 'DEGREES',
          label: this.jimuNls.units.degrees,
          abbr: this.jimuNls.units.degreesAbbr || 'dd',
          abbrTag: 'DD',
          format: "YN XE"
        }, {
          unit: 'DEGREE-MINUTE-SECOND',
          label: this.jimuNls.units.degreeMS,
          abbr: this.jimuNls.units.degreeMSAbbr || 'dms',
          abbrTag: 'DMS',
          format: "A°B'C\"N X°Y'Z\"E"
        }];

        this.defaultDistanceUnits = [{
          unit: 'KILOMETERS',
          label: this.nls.kilometers
        }, {
          unit: 'MILES',
          label: this.nls.miles
        }, {
          unit: 'METERS',
          label: this.nls.meters
        }, {
          unit: 'FEET',
          label: this.nls.feet
        }, {
          unit: 'YARDS',
          label: this.nls.yards
        }, {
          unit: 'NAUTICAL_MILES',
          label: this.nls.nauticalmiles
        }];

        this.defaultAreaUnits = [{
          unit: 'SQUARE_KILOMETERS',
          label: this.nls.squareKilometers
        }, {
          unit: 'SQUARE_MILES',
          label: this.nls.squareMiles
        }, {
          unit: 'ACRES',
          label: this.nls.acres
        }, {
          unit: 'HECTARES',
          label: this.nls.hectares
        }, {
          unit: 'SQUARE_METERS',
          label: this.nls.squareMeters
        }, {
          unit: 'SQUARE_FEET',
          label: this.nls.squareFeet
        }, {
          unit: 'SQUARE_YARDS',
          label: this.nls.squareYards
        }];
      },

      _initConfigUnits: function () {
        array.forEach(this.config.locationUnits, lang.hitch(this, function (unitInfo) {
          var unit = unitInfo.unit;
          //esriUnits don't has location units...
          // if(esriUnits[unit]){
          var defaultUnitInfo = this._getDefaultLocationUnitInfo(unit);
          unitInfo.label = defaultUnitInfo.label;
          unitInfo.abbrTag = defaultUnitInfo.abbrTag;
          this.configLocationUnits.push(unitInfo);
          // }
        }));

        array.forEach(this.config.distanceUnits, lang.hitch(this, function (unitInfo) {
          var unit = unitInfo.unit;
          if (esriUnits[unit]) {
            var defaultUnitInfo = this._getDefaultDistanceUnitInfo(unit);
            unitInfo.label = defaultUnitInfo.label;
            this.configDistanceUnits.push(unitInfo);
          }
        }));

        array.forEach(this.config.areaUnits, lang.hitch(this, function (unitInfo) {
          var unit = unitInfo.unit;
          if (esriUnits[unit]) {
            var defaultUnitInfo = this._getDefaultAreaUnitInfo(unit);
            unitInfo.label = defaultUnitInfo.label;
            this.configAreaUnits.push(unitInfo);
          }
        }));
      },

      _getDefaultLocationUnitInfo: function (unit) {
        for (var i = 0; i < this.defaultLocationUnits.length; i++) {
          var unitInfo = this.defaultLocationUnits[i];
          if (unitInfo.unit === unit) {
            return unitInfo;
          }
        }
        return null;
      },

      _getDefaultDistanceUnitInfo: function (unit) {
        for (var i = 0; i < this.defaultDistanceUnits.length; i++) {
          var unitInfo = this.defaultDistanceUnits[i];
          if (unitInfo.unit === unit) {
            return unitInfo;
          }
        }
        return null;
      },

      _getDefaultAreaUnitInfo: function (unit) {
        for (var i = 0; i < this.defaultAreaUnits.length; i++) {
          var unitInfo = this.defaultAreaUnits[i];
          if (unitInfo.unit === unit) {
            return unitInfo;
          }
        }
        return null;
      },

      _getLocationUnitInfo: function (unit) {
        for (var i = 0; i < this.locationUnits.length; i++) {
          var unitInfo = this.locationUnits[i];
          if (unitInfo.unit === unit) {
            return unitInfo;
          }
        }
        return null;
      },

      _getDistanceUnitInfo: function (unit) {
        for (var i = 0; i < this.distanceUnits.length; i++) {
          var unitInfo = this.distanceUnits[i];
          if (unitInfo.unit === unit) {
            return unitInfo;
          }
        }
        return null;
      },

      _getAreaUnitInfo: function (unit) {
        for (var i = 0; i < this.areaUnits.length; i++) {
          var unitInfo = this.areaUnits[i];
          if (unitInfo.unit === unit) {
            return unitInfo;
          }
        }
        return null;
      },

      _setMeasureVisibility: function () {
        html.setStyle(this.locationMeasure, 'display', 'none');
        html.setStyle(this.areaMeasure, 'display', 'none');
        html.setStyle(this.distanceMeasure, 'display', 'none');
        var locationDisplay = html.getStyle(this.pointSection, 'display');
        var lineDisplay = html.getStyle(this.lineSection, 'display');
        var polygonDisplay = html.getStyle(this.polygonSection, 'display');
        if (locationDisplay === 'block' && this._existLocationUnits) {
          html.setStyle(this.locationMeasure, 'display', 'block');
        } else if (lineDisplay === 'block' && this._existDistanceUnits) {
          this.distanceMeasureTitle.innerHTML = this.nls.showDistanceMeasurementForLine;
          this._resetToggleTips('distanceForLine');

          html.setStyle(this.distanceMeasure, 'display', 'block');
        } else if (polygonDisplay === 'block') {
          if (this._existDistanceUnits) {
            this.distanceMeasureTitle.innerHTML = this.nls.showDistanceMeasurementForPolygon;
            this._resetToggleTips('distanceForPolygon');
            html.setStyle(this.distanceMeasure, 'display', 'block');
          }
          if (this._existAreaUnits) {
            html.setStyle(this.areaMeasure, 'display', 'block');
          }
        }
      },

      _initToggleUnits: function () {
        var types = ["location", "area", "distance"];
        array.forEach(types, lang.hitch(this, function (type) {
          var node = this[type + "MeasureHeader"];
          var toggleOptions = {
            toggleTips: {
              toggleOn: this.nls[type + 'ToggleOn'],
              toggleOff: this.nls[type + 'ToggleOff']
            }
          };
          var toggleBtn = new ToggleButton(toggleOptions, this[type + "ToggleDraw"]);
          toggleBtn.startup();
          node.toggleButton = toggleBtn;
          this.own(on(node, 'click', lang.hitch(this, this.toggleFilter, node)));
          this.own(on(node, 'keydown', lang.hitch(this, function (node, evt) {
            if (evt.keyCode === keys.ENTER || evt.keyCode === keys.SPACE) {
              this.toggleFilter(node);
            }
          }, node)));
        }));
      },

      //reset toggle tips for distance measure (length/perimeter)
      _resetToggleTips: function (type) {
        var toggleTips = {
          toggleOn: this.nls[type + 'ToggleOn'],
          toggleOff: this.nls[type + 'ToggleOff']
        };
        this.distanceMeasureHeader.toggleButton.resetToggleTips(toggleTips);
      },

      toggleFilter: function (node) {
        var type = html.getAttr(node, "data-index");
        var dom = this[type + "Body"];
        var applied = html.hasClass(node, 'applied');
        if (applied) {
          node.toggleButton.uncheck();
          html.removeClass(node, 'applied');
          html.setStyle(dom, 'display', 'none');
        } else {
          node.toggleButton.check();
          html.addClass(node, 'applied');
          html.setStyle(dom, 'display', 'block');
        }
      },

      _getPointSymbol: function () {
        return this.pointSymChooser.getValidSymbol();
      },

      _getLineSymbol: function () {
        return this.lineSymChooser.getValidSymbol();
      },

      _getPolygonSymbol: function () {
        return this.fillSymChooser.getValidSymbol();
      },

      _getTextSymbol: function () {
        return this.textSymChooser.getValidSymbol();
      },

      _setDrawDefaultSymbols: function () {
        this.drawBox.setPointSymbol(this._getPointSymbol());
        this.drawBox.setLineSymbol(this._getLineSymbol());
        this.drawBox.setPolygonSymbol(this._getPolygonSymbol());
      },

      _getLocalDecimalNumber: function (numStr) {
        //return dojoNumber.format(parseFloat(numStr));//decimal precision is not enough
        return numStr.replace('.', this.numberDecimal);
      },

      getFormattedDDStr: function (fromValue, withFormatStr, addPrefix) {
        var r = {};
        r.sourceValue = fromValue;
        r.sourceFormatString = withFormatStr;

        var parts = fromValue.split(/[ ,]+/);

        r.latdeg = parts[0].replace(/[nNsS]/, '');
        var londegParts = parts[1].split('.'); //'058.123'
        parts[1] = parseInt(londegParts[0], 10).toString() + '.' + londegParts[1]; //'058.123' to '58.123'
        r.londeg = parts[1].replace(/[eEwW]/, '');

        //decimal locale
        r.latdeg = this._getLocalDecimalNumber(r.latdeg);
        r.londeg = this._getLocalDecimalNumber(r.londeg);
        if (addPrefix) {
          if (parts[0].slice(-1) === 'N') {
            r.latdeg = '+' + r.latdeg;
          } else {
            r.latdeg = '-' + r.latdeg;
          }
          if (parts[1].slice(-1) === "W") {
            r.londeg = '-' + r.londeg;
          } else {
            r.londeg = '+' + r.londeg;
          }
        }

        var s = withFormatStr.replace(/X/, r.londeg);
        s = s.replace(/[eEwW]/, parts[1].slice(-1));
        s = s.replace(/[nNsS]/, parts[0].slice(-1));
        s = s.replace(/Y/, r.latdeg);

        r.formatResult = s;
        return r;
      },

      getFormattedDMSStr: function (fromValue, withFormatStr, addPrefix) {
        var r = {};
        r.sourceValue = fromValue;
        r.sourceFormatString = withFormatStr;

        r.parts = fromValue.split(/[ ,]+/);

        r.latdeg = r.parts[0];
        r.latmin = r.parts[1];
        r.latsec = r.parts[2].replace(/[NnSs]/, '');

        r.londeg = r.parts[3];
        r.londeg = parseInt(r.londeg, 10).toString(); //'058' to '58'
        r.lonmin = r.parts[4];
        if (r.parts[5]) {
          r.lonsec = r.parts[5].replace(/[EWew]/, '');
        }

        //decimal locale
        r.latsec = this._getLocalDecimalNumber(r.latsec);
        r.lonsec = this._getLocalDecimalNumber(r.lonsec);
        if (addPrefix) {
          if (r.parts[2].slice(-1) === 'N') {
            r.latdeg = '+' + r.latdeg;
          } else {
            r.latdeg = '-' + r.latdeg;
          }
          if (r.parts[5].slice(-1) === 'W') {
            r.londeg = '-' + r.londeg;
          } else {
            r.londeg = '+' + r.londeg;
          }
        }

        //A°B'C''N X°Y'Z''E
        var s = withFormatStr.replace(/A/, r.latdeg);
        s = s.replace(/B/, r.latmin);
        s = s.replace(/C/, r.latsec);
        s = s.replace(/X/, r.londeg);
        s = s.replace(/Y/, r.lonmin);
        s = s.replace(/Z/, r.lonsec);
        s = s.replace(/[NnSs]/, r.parts[2].slice(-1));
        if (r.parts[5]) {
          s = s.replace(/[EeWw]/, r.parts[5].slice(-1));
        }

        r.formatResult = s;
        return r;
      },

      addPrefix: false, //Add "+/-" prefix to positive and negative numbers
      getCoordByFormat: function (type, value, format) {
        var r;
        type = type.toUpperCase();
        switch (type) {
          case 'DD':
            r = this.getFormattedDDStr(value, format, this.addPrefix);
            break;
          case 'DMS':
            r = this.getFormattedDMSStr(value, format, this.addPrefix);
            break;
        }
        return r.formatResult;
      },

      getCoordValues: function (fromInput, toType, numDigits) {
        var deferred = new Deferred();
        /**
         * for parameter info
         * http://resources.arcgis.com/en/help/arcgis-rest-api/#/To_GeoCoordinateString/02r30000026w000000/
         **/
        var params = {
          sr: 4326,
          coordinates: [[fromInput.x, fromInput.y]],
          conversionType: toType,
          numOfDigits: numDigits || 6,
          rounding: true,
          addSpaces: false
        };

        switch (toType) {
          case 'DD':
            params.numOfDigits = 6;
            break;
          case 'USNG':
            params.numOfDigits = 5;
            break;
          case 'MGRS':
            params.conversionMode = 'mgrsDefault';
            params.numOfDigits = 5;
            break;
          case 'UTM (H)':
            params.conversionType = 'utm';
            params.conversionMode = 'utmNorthSouth';
            params.addSpaces = true;
            break;
          case 'UTM':
            params.conversionType = 'utm';
            params.conversionMode = 'utmDefault';
            params.addSpaces = true;
            break;
          case 'GARS':
            params.conversionMode = 'garsDefault';
            break;
        }

        this._gs.toGeoCoordinateString(params).then(function (itm) {
          deferred.resolve(itm);
        }, function () {
          deferred.resolve(null);
        });

        return deferred.promise;
      },

      getDDPoint: function (fromPoint) {
        var def = new Deferred();
        var webMerc = new EsriSpatialReference(3857);
        if (webMercatorUtils.canProject(fromPoint, webMerc)) {
          // if the point is in geographics or can be projected to geographics do so
          def.resolve(webMercatorUtils.webMercatorToGeographic(webMercatorUtils.project(fromPoint, webMerc)));
        } else {
          // if the point is NOT geographics and can NOT be projected to geographics
          // Find the most appropriate geo transformation and project the point to geographic
          var args = {
            url: this._gs.url + '/findTransformations',
            content: {
              f: 'json',
              inSR: fromPoint.spatialReference.wkid,
              outSR: 4326,
              extentOfInterest: JSON.stringify(this.map.extent)
            },
            handleAs: 'json',
            callbackParamName: 'callback'
          };
          new EsriRequest(args, {
            usePost: false
          }).then(lang.hitch(this, function (response) {
            var transformations = response && response.transformations ?
              response.transformations : undefined;
            var wkid = transformations && transformations.length > 0 ?
              transformations[0].wkid : undefined;
            var pp = new EsriProjectParameters();
            pp.outSR = new EsriSpatialReference(4326);
            pp.geometries = [fromPoint];
            pp.transformForward = true;
            pp.transformation = wkid;
            this._gs.project(pp, lang.hitch(this, function (r) {
              def.resolve(r[0]);
            }), function (err) {
              def.reject(err);
            });
          }), lang.hitch(this, function (err) {
            def.reject(err);
          }));
        }
        return def;
      },

      _getSymbolFont: function (textFontSizeDijit) {
        var a = Font.STYLE_ITALIC, b = Font.VARIANT_NORMAL, c = Font.WEIGHT_NORMAL;
        var fontSize = this._getMeasureFontSize(textFontSizeDijit);
        return new Font(fontSize, a, b, c, "Arial Unicode MS");
      },

      _getMeasureFontSize: function (textFontSizeDijit) {
        return parseInt(textFontSizeDijit.get('value'), 10) + 'px';
      },

      _addLocationMeasure: function (geometry, graphic) {
        if (!this.domNode) {
          return;
        }
        //convert unit
        var unitInfo = this._getLocationUnitInfo(this.locationUnitSelect.value);
        var abbr = unitInfo.abbrTag, format = unitInfo.format;
        this.getDDPoint(geometry).then(lang.hitch(this, function (mapPoint) {
          this.getCoordValues(mapPoint, abbr, 4).then(lang.hitch(this, function (r) {
            var location = this.getCoordByFormat(abbr, r[0], format);
            var symbolFont = this._getSymbolFont(this.locationTextFontSize);
            var fontColor = this.locationTextColor.getColor();//.toRgba();

            // var label = this.nls.locationLabel;
            // var locationText = label.replace('${value}', location);
            var locationText = location;

            var textSymbol = new TextSymbol(locationText, symbolFont, fontColor);
            var _pointSymbol = this._getPointSymbol();
            var symbolHeight = _pointSymbol.height ? _pointSymbol.height : _pointSymbol.size; //for picturemarkersymbol & simplemarkersymbol
            var txtOffsetY = symbolHeight + _pointSymbol.yoffset - 10;
            var labelGraphic = new Graphic(geometry, textSymbol.setOffset(0, txtOffsetY), null, null);
            this._pushAddOperation([graphic, labelGraphic]);
          }), lang.hitch(this, function (err) {
            console.log(err);
          })
          );
        }), lang.hitch(this, function (err) {
          console.error(err);
        }
        ));
      },

      _addLineMeasure: function (geometry, graphic) {
        this._getLengthAndArea(geometry, false).then(lang.hitch(this, function (result) {
          if (!this.domNode) {
            return;
          }
          var length = result.length;
          var symbolFont = this._getSymbolFont(this.distanceTextFontSize);
          var fontColor = this.distanceTextColor.getColor();
          var ext = geometry.getExtent();
          var center = ext.getCenter();

          var unit = this.distanceUnitSelect.value;
          var abbr = this._getDistanceUnitInfo(unit).label;
          var localeLength = jimuUtils.localizeNumber(length.toFixed(1));
          var label = this.nls.distanceLabelForLine;
          var lengthText = label.replace('${value}', localeLength).replace('${unit}', abbr);

          var textSymbol = new TextSymbol(lengthText, symbolFont, fontColor);
          var labelGraphic = new Graphic(center, textSymbol, null, null);
          this._pushAddOperation([graphic, labelGraphic]);
        }), lang.hitch(this, function (err) {
          console.log(err);
          if (!this.domNode) {
            return;
          }
          this._pushAddOperation([graphic]);
        }));
      },

      _getLabelGraphic: function (label, unitAbbr, value, center, symbolFont, fontColor, offsetY) {
        var localeValue = jimuUtils.localizeNumber(value.toFixed(1));
        var text = label.replace('${value}', localeValue).replace('${unit}', unitAbbr);
        var textSymbol = new TextSymbol(text, symbolFont, fontColor);
        var textSymbolNew = textSymbol.setOffset(0, offsetY);
        var labelGraphic = new Graphic(center, textSymbolNew, null, null);
        return labelGraphic;
      },

      _addPolygonMeasure: function (geometry, graphic, ifArea, ifLength) {
        this._getLengthAndArea(geometry, true).then(lang.hitch(this, function (result) {
          if (!this.domNode) {
            return;
          }
          var ext = geometry.getExtent();
          var center = ext.getCenter();

          var graphics = [graphic];
          if (ifArea) {
            var offsetY1 = ifLength ? 5 : -5;
            var unitAbbr1 = this._getAreaUnitInfo(this.areaUnitSelect.value).label;
            var areaLabel = this.nls.areaLabel;
            var symbolFont1 = this._getSymbolFont(this.areaTextFontSize);
            var fontColor1 = this.areaTextColor.getColor();
            var labelGraphic1 = this._getLabelGraphic(areaLabel, unitAbbr1, result.area, center,
              symbolFont1, fontColor1, offsetY1);
            graphics.push(labelGraphic1);
          }
          if (ifLength) {
            var offsetY2 = ifArea ? -15 : -5;
            var unitAbbr2 = this._getDistanceUnitInfo(this.distanceUnitSelect.value).label;
            var distanceLabel = this.nls.distanceLabelForPolygon;
            var symbolFont2 = this._getSymbolFont(this.distanceTextFontSize);
            var fontColor2 = this.distanceTextColor.getColor();
            var labelGraphic2 = this._getLabelGraphic(distanceLabel, unitAbbr2, result.length, center,
              symbolFont2, fontColor2, offsetY2);
            graphics.push(labelGraphic2);
          }
          this._pushAddOperation(graphics);
        }), lang.hitch(this, function (err) {
          if (!this.domNode) {
            return;
          }
          console.log(err);
          this._pushAddOperation([graphic]);
        }));
      },

      _getLengthAndArea: function (geometry, isPolygon) {
        var def = new Deferred();
        var defResult = {
          length: null,
          area: null
        };
        var wkid = geometry.spatialReference.wkid;
        var areaUnit = this.areaUnitSelect.value;
        var esriAreaUnit = esriUnits[areaUnit];
        var lengthUnit = this.distanceUnitSelect.value;
        var esriLengthUnit = esriUnits[lengthUnit];
        if (wkidUtils.isWebMercator(wkid)) {
          defResult = this._getLengthAndArea3857(geometry, isPolygon, esriAreaUnit, esriLengthUnit);
          def.resolve(defResult);
        } else if (wkid === 4326) {
          defResult = this._getLengthAndArea4326(geometry, isPolygon, esriAreaUnit, esriLengthUnit);
          def.resolve(defResult);
        } else {
          def = this._getLengthAndAreaByGS(geometry, isPolygon, esriAreaUnit, esriLengthUnit);
        }
        return def;
      },

      _getLengthAndArea4326: function (geometry, isPolygon, esriAreaUnit, esriLengthUnit) {
        var result = {
          area: null,
          length: null
        };

        var lengths = null;

        if (isPolygon) {
          var areas = geodesicUtils.geodesicAreas([geometry], esriAreaUnit);
          var polyline = this._getPolylineOfPolygon(geometry);
          lengths = geodesicUtils.geodesicLengths([polyline], esriLengthUnit);
          result.area = Math.abs(areas[0]); //Convert area's result to Absolute value for the reason of ellipse's negative value.
          result.length = lengths[0];
        } else {
          lengths = geodesicUtils.geodesicLengths([geometry], esriLengthUnit);
          result.length = lengths[0];
        }

        return result;
      },

      _getLengthAndArea3857: function (geometry3857, isPolygon, esriAreaUnit, esriLengthUnit) {
        var geometry4326 = webMercatorUtils.webMercatorToGeographic(geometry3857);
        var result = this._getLengthAndArea4326(geometry4326,
          isPolygon,
          esriAreaUnit,
          esriLengthUnit);
        return result;
      },

      _getLengthAndAreaByGS: function (geometry, isPolygon, esriAreaUnit, esriLengthUnit) {
        var def = new Deferred();
        var defResult = {
          area: null,
          length: null
        };
        var gsAreaUnit = this._getGeometryServiceUnitByEsriUnit(esriAreaUnit);
        var gsLengthUnit = this._getGeometryServiceUnitByEsriUnit(esriLengthUnit);
        if (isPolygon) {
          var areasAndLengthParams = new AreasAndLengthsParameters();
          areasAndLengthParams.lengthUnit = gsLengthUnit;
          areasAndLengthParams.areaUnit = gsAreaUnit;
          this._gs.simplify([geometry]).then(lang.hitch(this, function (simplifiedGeometries) {
            if (!this.domNode) {
              return;
            }
            areasAndLengthParams.polygons = simplifiedGeometries;
            this._gs.areasAndLengths(areasAndLengthParams).then(lang.hitch(this, function (result) {
              if (!this.domNode) {
                return;
              }
              defResult.area = result.areas[0];
              defResult.length = result.lengths[0];
              def.resolve(defResult);
            }), lang.hitch(this, function (err) {
              def.reject(err);
            }));
          }), lang.hitch(this, function (err) {
            def.reject(err);
          }));
        } else {
          var lengthParams = new LengthsParameters();
          lengthParams.polylines = [geometry];
          lengthParams.lengthUnit = gsLengthUnit;
          lengthParams.geodesic = true;
          this._gs.lengths(lengthParams).then(lang.hitch(this, function (result) {
            if (!this.domNode) {
              return;
            }
            defResult.length = result.lengths[0];
            def.resolve(defResult);
          }), lang.hitch(this, function (err) {
            console.error(err);
            def.reject(err);
          }));
        }

        return def;
      },

      _getGeometryServiceUnitByEsriUnit: function (unit) {
        var gsUnit = -1;
        switch (unit) {
          case esriUnits.KILOMETERS:
            gsUnit = GeometryService.UNIT_KILOMETER;
            break;
          case esriUnits.MILES:
            gsUnit = GeometryService.UNIT_STATUTE_MILE;
            break;
          case esriUnits.METERS:
            gsUnit = GeometryService.UNIT_METER;
            break;
          case esriUnits.FEET:
            gsUnit = GeometryService.UNIT_FOOT;
            break;
          case esriUnits.YARDS:
            gsUnit = GeometryService.UNIT_INTERNATIONAL_YARD;
            break;
          case esriUnits.SQUARE_KILOMETERS:
            gsUnit = GeometryService.UNIT_SQUARE_KILOMETERS;
            break;
          case esriUnits.SQUARE_MILES:
            gsUnit = GeometryService.UNIT_SQUARE_MILES;
            break;
          case esriUnits.ACRES:
            gsUnit = GeometryService.UNIT_ACRES;
            break;
          case esriUnits.HECTARES:
            gsUnit = GeometryService.UNIT_HECTARES;
            break;
          case esriUnits.SQUARE_METERS:
            gsUnit = GeometryService.UNIT_SQUARE_METERS;
            break;
          case esriUnits.SQUARE_FEET:
            gsUnit = GeometryService.UNIT_SQUARE_FEET;
            break;
          case esriUnits.SQUARE_YARDS:
            gsUnit = GeometryService.UNIT_SQUARE_YARDS;
            break;
        }
        return gsUnit;
      },

      _getPolylineOfPolygon: function (polygon) {
        var polyline = new Polyline(polygon.spatialReference);
        var points = polygon.rings[0];
        polyline.addPath(points);
        return polyline;
      },

      destroy: function () {
        if (this._undoManager) {
          this._undoManager.destroy();
          this._undoManager = null;
        }
        if (this.drawBox) {
          this.drawBox.destroy();
          this.drawBox = null;
        }
        if (this._graphicsLayer) {
          this._graphicsLayer.clear();
          this.map.removeLayer(this._graphicsLayer);
          this._graphicsLayer = null;
        }
        if (this._pointLayer) {
          this.map.removeLayer(this._pointLayer);
          this._pointLayer = null;
        }
        if (this._polylineLayer) {
          this.map.removeLayer(this._polylineLayer);
          this._polylineLayer = null;
        }
        if (this._polygonLayer) {
          this.map.removeLayer(this._polygonLayer);
          this._polygonLayer = null;
        }
        if (this._labelLayer) {
          this.map.removeLayer(this._labelLayer);
          this._labelLayer = null;
        }
        if (this.pointSymChooser) {
          this.pointSymChooser.destroy();
          this.pointSymChooser = null;
        }
        if (this.lineSymChooser) {
          this.lineSymChooser.destroy();
          this.lineSymChooser = null;
        }
        if (this.fillSymChooser) {
          this.fillSymChooser.destroy();
          this.fillSymChooser = null;
        }
        if (this.textSymChooser) {
          this.textSymChooser.destroy();
          this.textSymChooser = null;
        }
        this.inherited(arguments);
      },

      startup: function () {
        this.inherited(arguments);
        this.viewStack.startup();
        this.viewStack.switchView(null);
      },

      _getAllGraphics: function () {
        //return a new array
        return array.map(this._graphicsLayer.graphics, lang.hitch(this, function (g) {
          return g;
        }));
      },

      _onUndoManagerChanged: function () {
        this._enableBtn(this.btnUndo, this._undoManager.canUndo);
        this._enableBtn(this.btnRedo, this._undoManager.canRedo);
        var graphics = this._getAllGraphics();
        this._enableBtn(this.btnClear, graphics.length > 0);
        this._syncGraphicsToLayers();

        //MJM - Add drawn graphic coordinates to panel with every change in Undo/Redo/Clear button click--------------------------------------
        this._clearPreviousCoordinates();  // Clear draw coordinates section
        var theCoordinates = [];  //array to hold all graphic coordinates
        array.forEach(this._graphicsLayer.graphics, function (feature) {
          var drawnPolygon = webMercatorUtils.webMercatorToGeographic(feature.geometry);  //Converts selected polygon geometry from Web Mercator units to geographic units.
          theCoordinates.push(JSON.stringify(drawnPolygon.rings[0]));  //Accumulate all the polygons coordinates into array
        });
        if (this._graphicsLayer.graphics.length > 0) {
          document.getElementById("coordsTextAreaDRAW").appendChild(document.createTextNode('[' + theCoordinates + ']'));  //Update textarea with coordinates - Add coordinate object as string - stringify to keep []
        } else {
          document.getElementById("coordsTextAreaDRAW").appendChild(document.createTextNode(''));  //just empty out textarea
        }
        //End MJM ----------------------------------------------------------
      },

      _clearPreviousCoordinates: function () {   //MJM - Clear draw coordinates section
        var myNode = document.getElementById("coordsTextAreaDRAW");
        while (myNode.firstChild) {
          myNode.removeChild(myNode.firstChild);  //remove section
        }
      },

      _copy2Clipboard: function () {  //MJM - copy coordinates from textarea to clipboard
        document.getElementById("coordsTextAreaDRAW").select();
        document.execCommand('copy');
      },

      _syncGraphicsToLayers: function () {
        /*global isRTL*/
        if (this._pointLayer) {
          this._pointLayer.clear();
        }
        if (this._polylineLayer) {
          this._polylineLayer.clear();
        }
        if (this._polygonLayer) {
          this._polygonLayer.clear();
        }
        if (this._labelLayer) {
          this._labelLayer.clear();
        }
        var graphics = this._getAllGraphics();
        array.forEach(graphics, lang.hitch(this, function (g) {
          var graphicJson = g.toJson();
          var clonedGraphic = new Graphic(graphicJson);
          var geoType = clonedGraphic.geometry.type;
          var layer = null;
          var isNeedRTL = false;

          if (geoType === 'point') {
            if (clonedGraphic.symbol && clonedGraphic.symbol.type === 'textsymbol') {
              layer = this._labelLayer;
              isNeedRTL = isRTL;
            } else {
              layer = this._pointLayer;
            }
          } else if (geoType === 'polyline') {
            layer = this._polylineLayer;
          } else if (geoType === 'polygon' || geoType === 'extent') {
            layer = this._polygonLayer;
          }
          if (layer) {
            var graphic = layer.add(clonedGraphic);
            if (true === isNeedRTL && graphic.getNode) {
              var node = graphic.getNode();
              if (node) {
                //SVG <text>node can't set className by domClass.add(node, "jimu-rtl"); so set style
                //It's not work that set "direction:rtl" to SVG<text>node in IE11, it is IE's bug
                domStyle.set(node, "direction", "rtl");
              }
            }
          }
        }));
      },

      _pushAddOperation: function (graphics) {
        array.forEach(graphics, lang.hitch(this, function (g) {
          var attrs = g.attributes || {};
          attrs[this._objectIdName] = this._objectIdCounter++;
          g.setAttributes(attrs);
          this._graphicsLayer.add(g);
        }));
        var addOperation = new customOp.Add({
          graphicsLayer: this._graphicsLayer,
          addedGraphics: graphics
        });
        this._undoManager.add(addOperation);
      },

      _pushDeleteOperation: function (graphics) {
        var deleteOperation = new customOp.Delete({
          graphicsLayer: this._graphicsLayer,
          deletedGraphics: graphics
        });
        this._undoManager.add(deleteOperation);
      },

      _enableBtn: function (btn, isEnable) {
        if (isEnable) {
          html.removeClass(btn, 'jimu-state-disabled');
          html.attr(btn, "aria-label", btn.innerHTML);
        } else {
          html.addClass(btn, 'jimu-state-disabled');
          html.attr(btn, "aria-label", btn.innerHTML + ' ' + window.jimuNls.common.disabled);
        }
      },

      _onBtnUndoClicked: function () {
        this._undoManager.undo();
      },

      _onBtnRedoClicked: function () {
        this._undoManager.redo();
      },

      _onBtnClearClicked: function () {
        var graphics = this._getAllGraphics();
        if (graphics.length > 0) {
          this._graphicsLayer.clear();
          this._pushDeleteOperation(graphics);
        }
        this._enableBtn(this.btnClear, false);
      }
    });
  });