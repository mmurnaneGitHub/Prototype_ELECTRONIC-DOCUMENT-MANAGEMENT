var map;
require([
  "esri/map",
  "esri/graphic",
  "esri/symbols/SimpleFillSymbol",
  "esri/geometry/Polygon",
  "esri/layers/GraphicsLayer",
  "dojo/domReady!"
], function (Map, Graphic, SimpleFillSymbol,
  Polygon, GraphicsLayer) {

    map = new Map("map", {
      basemap: "gray",
      center: [-122.459963, 47.230583],
      zoom: 12
    });
    var graphicLayer = new GraphicsLayer();
    map.addLayer(graphicLayer);  //add empty graphic layer to map

    var theCoordinates = [[-122.494442, 47.242775], [-122.498401, 47.242826], [-122.498423, 47.240174], [-122.496674, 47.240160], [-122.496760, 47.241238], [-122.494131, 47.241296], [-122.494442, 47.242775]];
    var thePolygon = new Polygon(theCoordinates);
    var thePolygonGraphic = new Graphic(thePolygon, new SimpleFillSymbol());

    graphicLayer.add(thePolygonGraphic);  //add element to graphic layer

  });