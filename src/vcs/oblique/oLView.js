import Projection from 'ol/proj/Projection';
import View from 'ol/View';
import TileGrid from 'ol/tilegrid/TileGrid';
import TileImageSource from 'ol/source/TileImage';
import TileLayer from 'ol/layer/Tile';
import Url from '../url';

/**
 * @typedef {Object} vcs.oblique.OLView.Options
 * @property {string} url
 * @property {ol.Size} size
 * @property {Array<number>} tileResolution
 * @property {ol.Size} tileSize
 * @property {number} minZoom
 * @property {string|undefined} format
 * @api
 */

let nextId = 0;
/**
 * @constructor
 * @memberOf vcs.oblique
 * @api
 */
class OLView {
  /**
   * @param {vcs.oblique.OLView.Options} options
   */
  constructor(options) {
    /** @type {number} */
    this.id = nextId;
    nextId += 1;
    /** @type {ol.Size} */
    this.size = options.size;
    /** @type {string} */
    this.url = options.url;
    /** @type {ol.Size} */
    this.tileSize = options.tileSize;
    /** @type {Array<number>} */
    this.tileResolution = options.tileResolution;
    /** @type {string} */
    this.format = options.format || 'jpg';
    /** @type {number} */
    this.minZoom = options.minZoom;
    this._createViewAndLayer();
  }

  _createViewAndLayer() {
    const extent = /** @type {ol.Extent} */ ([0, 0, ...this.size]);
    const zoomifyProjection = new Projection({
      code: 'ZOOMIFY',
      units: 'pixels',
      extent,
    });

    /** @type {ol.View} */
    this.view = new View({
      projection: zoomifyProjection,
      center: [this.size[0] / 2, this.size[1] / 2],
      minZoom: this.minZoom,
      maxZoom: this.tileResolution.length + 4,
      extent: /** @type {ol.Extent} */ ([
        -2000,
        -2000,
        this.size[0] + 2000,
        this.size[1] + 2000,
      ]),
      zoom: this.minZoom,
    });

    const tileImageOptions = {
      projection: zoomifyProjection,
      tileGrid: new TileGrid({
        origin: [0, 0],
        extent,
        resolutions: this.tileResolution,
        tileSize: this.tileSize,
      }),
    };
    if (!Url.hasSameOrigin(this.url)) {
      tileImageOptions.crossOrigin = 'anonymous';
    }
    /** @type {ol.source.TileImage} */
    this.tileImageSource = new TileImageSource(tileImageOptions);

    /** @type {ol.layer.Tile} */
    this.layer = new TileLayer({
      source: this.tileImageSource,
      extent,
    });
  }

  /**
   * @return {vcs.oblique.OLView}
   */
  clone() {
    return new OLView({
      size: this.size,
      url: this.url,
      tileSize: this.tileSize,
      tileResolution: this.tileResolution,
      minZoom: this.minZoom,
    });
  }

  /**
   * @param {ol.Size} size
   */
  setSize(size) {
    this.size = size;
    this._createViewAndLayer();
  }

  /**
   * @param {string} name
   */
  setImageName(name) {
    this.tileImageSource.setTileUrlFunction((coords) => {
      const [z, x, y] = coords;
      return `${this.url}/${name}/${z}/${x}/${y}.${this.format}`;
    });
    this.tileImageSource.refresh();
  }
}

export default OLView;
