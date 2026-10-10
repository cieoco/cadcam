/** 四塊真實輸出板件；5mm包邊容納主孔，O 位於側板中段，固定支架在O右側。 */
export const tippingBucketSnapshot = {
  "kind": "blocks",
  "v": 1,
  "counter": 20,
  "comps": [
    {
      "type": "bar",
      "id": "Support",
      "moduleId": "Driver",
      "p1": {
        "id": "S",
        "type": "fixed",
        "x": 40,
        "y": 0
      },
      "p2": {
        "id": "SupportAxis",
        "type": "fixed",
        "x": 0,
        "y": 0
      },
      "lenParam": "SupportLength",
      "fixedLen": true,
      "stock": {
        "widthMm": 40,
        "thicknessMm": 3
      }
    },
    {
      "type": "bar",
      "id": "Drive",
      "moduleId": "Driver",
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
      "physicalMotor": "1",
      "motorType": "mg995",
      "servoStart": 0,
      "servoEnd": -100,
      "motorMount": {
        "motor": "1",
        "center": "O",
        "outputBody": "Drive",
        "frameBody": "Support",
        "orientation": "horizontal",
        "reversed": false
      },
      "stock": {
        "widthMm": 18,
        "thicknessMm": 3
      }
    },
    {
      "type": "triangle",
      "id": "LeftSide",
      "moduleId": "Driver",
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
        "x": 0,
        "y": 20
      },
      "gParam": "BucketBase",
      "r1Param": "SideHeight",
      "r2Param": "SideDiagonal",
      "sign": 1,
      "shapeMode": "hull",
      "vertices": [
        {
          "solve": true,
          "ref": "p1"
        },
        {
          "solve": false,
          "u": 0,
          "v": -20
        },
        {
          "solve": false,
          "u": 80,
          "v": -20
        },
        {
          "solve": true,
          "ref": "p2"
        },
        {
          "solve": false,
          "u": 80,
          "v": 20
        },
        {
          "solve": true,
          "ref": "p3"
        }
      ],
      "stock": {
        "widthMm": 10,
        "thicknessMm": 3
      }
    },
    {
      "type": "anchor",
      "id": "RightSideAnchorA",
      "moduleId": "RightSide",
      "p1": {
        "id": "RightSideA",
        "type": "fixed",
        "x": -15,
        "y": 0,
        "frameStock": {
          "lengthMm": 90,
          "widthMm": 50,
          "thicknessMm": 3
        }
      }
    },
    {
      "type": "anchor",
      "id": "RightSideAnchorB",
      "moduleId": "RightSide",
      "p1": {
        "id": "RightSideB",
        "type": "fixed",
        "x": 15,
        "y": 0
      }
    },
    {
      "type": "anchor",
      "id": "FloorAnchorA",
      "moduleId": "Floor",
      "p1": {
        "id": "FloorA",
        "type": "fixed",
        "x": -15,
        "y": 0,
        "frameStock": {
          "lengthMm": 130,
          "widthMm": 100,
          "thicknessMm": 3
        }
      }
    },
    {
      "type": "anchor",
      "id": "FloorAnchorB",
      "moduleId": "Floor",
      "p1": {
        "id": "FloorB",
        "type": "fixed",
        "x": 15,
        "y": 0
      }
    },
    {
      "type": "anchor",
      "id": "BackAnchorA",
      "moduleId": "Back",
      "p1": {
        "id": "BackA",
        "type": "fixed",
        "x": -15,
        "y": 0,
        "frameStock": {
          "lengthMm": 60,
          "widthMm": 50,
          "thicknessMm": 3
        }
      }
    },
    {
      "type": "anchor",
      "id": "BackAnchorB",
      "moduleId": "Back",
      "p1": {
        "id": "BackB",
        "type": "fixed",
        "x": 15,
        "y": 0
      }
    }
  ],
  "modules": [
    {
      "id": "Driver",
      "name": "支架與左側板",
      "base": "O",
      "outputs": [
        {
          "id": "side",
          "name": "side",
          "at": "O",
          "body": {
            "kind": "triangle",
            "id": "LeftSide"
          }
        }
      ],
      "mount": null
    },
    {
      "id": "RightSide",
      "name": "RightSide",
      "base": "RightSideA",
      "outputs": [],
      "mount": {
        "to": {
          "module": "Floor",
          "frame": {
            "edge": 6
          }
        },
        "ref": {
          "x": 63,
          "y": 50,
          "a": 180
        },
        "home": {},
        "face": {
          "version": 1,
          "childPart": "frame",
          "rotation": [
            [
              1,
              0,
              0
            ],
            [
              0,
              0,
              -1
            ],
            [
              0,
              1,
              0
            ]
          ],
          "translation": {
            "x": 0,
            "y": -31.5,
            "z": 26.5
          },
          "selection": {
            "brackets": {
              "enabled": true,
              "offsets": {
                "L1": 0,
                "R1": 0,
                "L2": 0
              },
              "childPart": "frame"
            },
            "hostFace": "top",
            "childFace": "back",
            "alignU": 0,
            "alignV": 0,
            "offsetU": 0,
            "offsetV": -31.5,
            "gap": 0,
            "quarterTurns": 0
          },
          "hostThicknessMm": 3,
          "childThicknessMm": 3
        }
      }
    },
    {
      "id": "Floor",
      "name": "Floor",
      "base": "FloorA",
      "outputs": [],
      "mount": {
        "to": {
          "module": "Driver",
          "output": "side"
        },
        "ref": {
          "x": 0,
          "y": 0,
          "a": 0
        },
        "home": {},
        "face": {
          "version": 1,
          "childPart": "frame",
          "rotation": [
            [
              1,
              0,
              0
            ],
            [
              0,
              0,
              1
            ],
            [
              0,
              -1,
              0
            ]
          ],
          "translation": {
            "x": 40,
            "y": -26.5,
            "z": 31.5
          },
          "selection": {
            "brackets": {
              "enabled": true,
              "offsets": {
                "L1": 0,
                "R1": 0,
                "L2": 0
              },
              "childPart": "frame"
            },
            "hostFace": "back",
            "childFace": "top",
            "alignU": 0,
            "alignV": 0,
            "offsetU": 0,
            "offsetV": 31.5,
            "gap": 0,
            "quarterTurns": 0
          },
          "hostThicknessMm": 3,
          "childThicknessMm": 3
        }
      }
    },
    {
      "id": "Back",
      "name": "Back",
      "base": "BackA",
      "outputs": [],
      "mount": {
        "to": {
          "module": "Floor",
          "frame": {
            "edge": 6
          }
        },
        "ref": {
          "x": 63,
          "y": 50,
          "a": 180
        },
        "home": {},
        "face": {
          "version": 1,
          "childPart": "frame",
          "rotation": [
            [
              -6.123233995736766e-17,
              0,
              1
            ],
            [
              -1,
              0,
              -6.123233995736766e-17
            ],
            [
              0,
              -1,
              0
            ]
          ],
          "translation": {
            "x": -46.5,
            "y": 0,
            "z": 26.5
          },
          "selection": {
            "brackets": {
              "enabled": true,
              "offsets": {
                "L1": 0,
                "R1": 0,
                "L2": 0
              },
              "childPart": "frame"
            },
            "hostFace": "top",
            "childFace": "front",
            "alignU": 0,
            "alignV": 0,
            "offsetU": -46.5,
            "offsetV": 0,
            "gap": 0,
            "quarterTurns": 1
          },
          "hostThicknessMm": 3,
          "childThicknessMm": 3
        }
      }
    }
  ],
  "params": {
    "bucketAssembly": 1,
    "BucketBase": 80,
    "SideHeight": 20,
    "SideDiagonal": 82.46211251235322,
    "SupportLength": 40,
    "theta": 0
  },
  "fabrication": {
    "v": 1,
    "export": {
      "barWidthMm": 18,
      "holeDiameterMm": 3.2,
      "frameMarginMm": 18,
      "frameHoleDiameterMm": 3.2,
      "ttShaftFlatDiameterMm": 5.4,
      "ttShaftFlatThicknessMm": 3.7
    },
    "ttMount": {
      "shaftDiameterMm": 6,
      "screwDiameterMm": 3,
      "screwOffsetXMm": -20.6,
      "screwSpacingMm": 17.3,
      "locatorDiameterMm": 4,
      "locatorOffsetXMm": -11.18,
      "locatorOffsetYMm": 0
    },
    "mg995Mount": {
      "bodyLengthMm": 41.2,
      "bodyWidthMm": 20.2,
      "shaftOffsetMm": 10,
      "screwDiameterMm": 3.2,
      "screwSpanMm": 49.5,
      "screwSpacingMm": 10,
      "cableNotchWidthMm": 8,
      "cableNotchDepthMm": 4
    },
    "cnc": {
      "toolDiameterMm": 3.175,
      "stockThicknessMm": 3
    },
    "drive": {
      "ttHubCenterMm": 6,
      "ttHubScrewMm": 3.2,
      "ttHubScrewSpacingMm": 12,
      "hornCenterMm": 6,
      "hornScrewMm": 2.2,
      "hornScrewCount": 4,
      "hornScrewCircleMm": 14
    },
    "joint": {
      "defaultKind": "bracket-m3",
      "bracket": {
        "widthMm": 7,
        "thicknessMm": 1.2,
        "longLegMm": 13,
        "shortLegMm": 9.5,
        "holeEndMm": 3.5
      }
    }
  },
  "tracePoints": [
    "P"
  ]
};

