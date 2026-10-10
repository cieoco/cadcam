/** 相容既有側視作品；不代表立體組立驗證。 */
export const tippingBucketLegacy = {
  "kind": "blocks",
  "v": 1,
  "counter": 4,
  "tracePoints": [
    "P"
  ],
  "comps": [
    {
      "type": "anchor",
      "id": "Axis",
      "p1": {
        "id": "O",
        "type": "fixed",
        "x": 0,
        "y": 0,
        "physicalMotor": "1"
      }
    },
    {
      "type": "bar",
      "id": "Drive",
      "color": "#3498db",
      "p1": {
        "id": "O",
        "type": "motor",
        "x": 0,
        "y": 0,
        "physicalMotor": "1"
      },
      "p2": {
        "id": "P",
        "type": "floating",
        "x": 80,
        "y": 0
      },
      "lenParam": "BucketBase",
      "fixedLen": true,
      "isInput": true,
      "snapLength": false
    },
    {
      "type": "triangle",
      "id": "Bucket",
      "color": "#f39c12",
      "p1": {
        "id": "O",
        "type": "motor",
        "x": 0,
        "y": 0,
        "physicalMotor": "1"
      },
      "p2": {
        "id": "P",
        "type": "floating",
        "x": 80,
        "y": 0
      },
      "p3": {
        "id": "L",
        "type": "floating",
        "x": -20,
        "y": 40
      },
      "gParam": "BucketBase",
      "r1Param": "BucketLeft",
      "r2Param": "BucketDiagonal",
      "sign": 1,
      "shapeMode": "polyline",
      "vertices": [
        {
          "solve": true,
          "ref": "p3"
        },
        {
          "solve": true,
          "ref": "p1"
        },
        {
          "solve": true,
          "ref": "p2"
        },
        {
          "solve": false,
          "u": 100,
          "v": 40
        }
      ]
    }
  ],
  "params": {
    "BucketBase": 80,
    "BucketLeft": 44.721359549995796,
    "BucketDiagonal": 107.70329614269008,
    "bucketWorkflow": 1,
    "bucketStowAngle": 0,
    "bucketDumpAngle": -100,
    "theta": 0
  }
};
