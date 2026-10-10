/** 由共同群組操作產生的靜態範例；test/lift-bucket.mjs 核對 builder 結果，避免載入期循環。 */
export const liftBucketSnapshot = {
  "kind": "blocks",
  "v": 1,
  "counter": 20,
  "comps": [
    {
      "type": "triangle",
      "id": "LeftSide",
      "moduleId": "RigidGroup",
      "p1": {
        "id": "RigidGroup-O",
        "type": "fixed",
        "x": -62,
        "y": 0
      },
      "p2": {
        "id": "RigidGroup-P",
        "type": "fixed",
        "x": 18,
        "y": 0
      },
      "p3": {
        "id": "RigidGroup-L",
        "type": "floating",
        "x": -62.00000000000001,
        "y": 20
      },
      "gParam": "RigidGroup-BucketBase",
      "r1Param": "RigidGroup-SideHeight",
      "r2Param": "RigidGroup-SideDiagonal",
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
    },
    {
      "type": "anchor",
      "id": "Anchor1",
      "p1": {
        "id": "A",
        "type": "fixed",
        "x": -110,
        "y": 0
      },
      "moduleId": "Lift"
    },
    {
      "type": "anchor",
      "id": "Anchor2",
      "p1": {
        "id": "B",
        "type": "fixed",
        "x": -110,
        "y": 72
      },
      "moduleId": "Lift"
    },
    {
      "type": "bar",
      "id": "Link1",
      "color": "#e74c3c",
      "p1": {
        "id": "A",
        "type": "fixed",
        "x": -110,
        "y": 0,
        "physicalMotor": "1"
      },
      "p2": {
        "id": "C",
        "type": "floating",
        "x": -62,
        "y": 0
      },
      "lenParam": "LL1",
      "fixedLen": true,
      "isInput": true,
      "physicalMotor": "1",
      "phaseOffset": 0,
      "moduleId": "Lift"
    },
    {
      "type": "bar",
      "id": "Link2",
      "color": "#3498db",
      "p1": {
        "id": "B",
        "type": "fixed",
        "x": -110,
        "y": 72
      },
      "p2": {
        "id": "D",
        "type": "floating",
        "x": -62,
        "y": 72
      },
      "lenParam": "LL2",
      "fixedLen": true,
      "isInput": false,
      "moduleId": "Lift"
    },
    {
      "type": "bar",
      "id": "Link3",
      "color": "#3498db",
      "p1": {
        "id": "C",
        "type": "floating",
        "x": -62,
        "y": 0
      },
      "p2": {
        "id": "D",
        "type": "floating",
        "x": -62,
        "y": 72
      },
      "lenParam": "LL3",
      "fixedLen": true,
      "isInput": false,
      "moduleId": "Lift"
    }
  ],
  "modules": [
    {
      "id": "Lift",
      "name": "平行升降臂",
      "base": "A",
      "outputs": [
        {
          "id": "tool",
          "name": "保持姿態工具架",
          "at": "C",
          "body": {
            "kind": "bar",
            "id": "Link3"
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
          "module": "RigidGroup",
          "output": "side"
        },
        "ref": {
          "x": -62,
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
            "x": -22,
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
    },
    {
      "id": "RigidGroup",
      "name": "托斗",
      "rigidGroups": [
        {
          "id": "group-side",
          "name": "托斗",
          "output": "side",
          "members": [
            "Floor",
            "Back",
            "RightSide"
          ]
        }
      ],
      "base": "RigidGroup-O",
      "outputs": [
        {
          "id": "side",
          "name": "基準板",
          "at": "RigidGroup-O",
          "body": {
            "kind": "triangle",
            "id": "LeftSide"
          }
        }
      ],
      "mount": {
        "to": {
          "module": "Lift",
          "output": "tool"
        },
        "ref": {
          "x": -62,
          "y": 0,
          "a": 90
        },
        "home": {
          "1": 0
        }
      }
    }
  ],
  "params": {
    "BucketBase": 80,
    "SideHeight": 20,
    "SideDiagonal": 82.46211251235322,
    "SupportLength": 40,
    "theta": 0,
    "RigidGroup-BucketBase": 80,
    "RigidGroup-SideHeight": 20,
    "RigidGroup-SideDiagonal": 82.46211251235322,
    "LL1": 48,
    "LL2": 48,
    "LL3": 72,
    "parallelWorkflow": 1,
    "parallelStartHeight": 10,
    "parallelEndHeight": 35,
    "liftBucket": 1
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
