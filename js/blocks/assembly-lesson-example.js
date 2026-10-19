// 第七單元：側面升降、水平向前夾取；接合記錄由現有選面／角碼流程產生。
export const assemblyLessonSnapshot = {
  "kind": "blocks",
  "v": 1,
  "counter": 30,
  "comps": [
    {
      "type": "anchor",
      "id": "Anchor1",
      "p1": {
        "id": "A",
        "type": "fixed",
        "x": -110,
        "y": 0
      },
      "moduleId": "Lift1"
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
      "moduleId": "Lift1"
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
        "x": 50,
        "y": 0
      },
      "lenParam": "LL1",
      "fixedLen": true,
      "isInput": true,
      "physicalMotor": "1",
      "phaseOffset": 0,
      "moduleId": "Lift1",
      "motorType": "mg995",
      "servoStart": -40,
      "servoEnd": 60
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
        "x": 50,
        "y": 72
      },
      "lenParam": "LL2",
      "fixedLen": true,
      "isInput": false,
      "moduleId": "Lift1"
    },
    {
      "type": "triangle",
      "id": "Link3",
      "color": "#3498db",
      "p1": {
        "id": "C",
        "type": "floating",
        "x": 50,
        "y": 0
      },
      "p2": {
        "id": "D",
        "type": "floating",
        "x": 50,
        "y": 72
      },
      "moduleId": "Lift1",
      "p3": {
        "id": "E",
        "type": "floating",
        "x": 104,
        "y": 72
      },
      "gParam": "LL3",
      "r1Param": "ToolDiagonal",
      "r2Param": "ToolTop",
      "sign": -1,
      "shapeMode": "polygon",
      "vertices": [
        {
          "solve": true,
          "ref": "p1"
        },
        {
          "solve": true,
          "ref": "p2"
        },
        {
          "solve": true,
          "ref": "p3"
        },
        {
          "solve": false,
          "u": 0,
          "v": -54
        }
      ]
    },
    {
      "type": "gear",
      "id": "GearA",
      "color": "#e74c3c",
      "p1": {
        "id": "GCA",
        "type": "motor",
        "x": 50,
        "y": 0,
        "physicalMotor": "2",
        "frameStock": {
          "lengthMm": 110,
          "widthMm": 120,
          "thicknessMm": 3
        }
      },
      "p2": {
        "id": "GPA",
        "type": "floating",
        "x": 50,
        "y": 18
      },
      "radiusParam": "GRA",
      "pinRadiusParam": "GPRA",
      "pinHoleDiameter": 5,
      "teeth": 15,
      "module": 4,
      "phase": 90,
      "moduleId": "Grip1"
    },
    {
      "type": "gear",
      "id": "GearB",
      "color": "#2c6fbb",
      "p1": {
        "id": "GCB",
        "type": "fixed",
        "x": 110,
        "y": 0,
        "frameStock": {
          "lengthMm": 110,
          "widthMm": 120,
          "thicknessMm": 3
        }
      },
      "p2": {
        "id": "GPB",
        "type": "floating",
        "x": 110,
        "y": 18
      },
      "radiusParam": "GRB",
      "pinRadiusParam": "GPRB",
      "pinHoleDiameter": 5,
      "teeth": 15,
      "module": 4,
      "phase": 90,
      "mesh": "GearA",
      "moduleId": "Grip1"
    },
    {
      "type": "triangle",
      "id": "LeftJaw",
      "color": "#ff6b35",
      "p1": {
        "id": "GCA",
        "type": "motor",
        "x": 50,
        "y": 0,
        "physicalMotor": "2",
        "frameStock": {
          "lengthMm": 110,
          "widthMm": 120,
          "thicknessMm": 3
        }
      },
      "p2": {
        "id": "GPA",
        "type": "floating",
        "x": 50,
        "y": 18
      },
      "p3": {
        "id": "LT",
        "type": "floating",
        "x": -15,
        "y": -85
      },
      "gParam": "GPRA",
      "r1Param": "LJ_tip",
      "r2Param": "LJ_edge",
      "sign": 1,
      "shape": "jaw",
      "shapeMode": "polyline",
      "jawTurnSign": 1,
      "moduleId": "Grip1"
    },
    {
      "type": "triangle",
      "id": "RightJaw",
      "color": "#ff6b35",
      "p1": {
        "id": "GCB",
        "type": "fixed",
        "x": 110,
        "y": 0,
        "frameStock": {
          "lengthMm": 110,
          "widthMm": 120,
          "thicknessMm": 3
        }
      },
      "p2": {
        "id": "GPB",
        "type": "floating",
        "x": 110,
        "y": 18
      },
      "p3": {
        "id": "RT",
        "type": "floating",
        "x": 175,
        "y": -85
      },
      "gParam": "GPRB",
      "r1Param": "RJ_tip",
      "r2Param": "RJ_edge",
      "sign": -1,
      "shape": "jaw",
      "shapeMode": "polyline",
      "jawTurnSign": -1,
      "moduleId": "Grip1"
    }
  ],
  "params": {
    "theta": 0,
    "GRA": 30,
    "GRB": 30,
    "GPRA": 18,
    "GPRB": 18,
    "LJ_tip": 107,
    "LJ_edge": 121.8,
    "RJ_tip": 107,
    "RJ_edge": 121.8,
    "LL1": 160,
    "LL2": 160,
    "LL3": 72,
    "ToolDiagonal": 90,
    "ToolTop": 54
  },
  "modules": [
    {
      "id": "Lift1",
      "name": "平行四連桿升降臂",
      "source": "parallel-fourbar",
      "base": "A",
      "outputs": [
        {
          "id": "tool",
          "name": "工具架",
          "at": "C",
          "body": {
            "kind": "triangle",
            "id": "Link3"
          }
        }
      ],
      "mount": null,
      "mates": {
        "attach": null,
        "receive": [
          {
            "id": "tool-forward",
            "name": "工具架上緣（水平夾取）",
            "ref": {
              "kind": "triangle",
              "id": "Link3",
              "edge": 1
            }
          }
        ]
      },
      "faceParts": {
        "part": "Link3",
        "face": "front"
      }
    },
    {
      "id": "Grip1",
      "name": "齒輪夾爪",
      "source": "gear-gripper",
      "base": "GCA",
      "outputs": [],
      "mount": {
        "to": {
          "module": "Lift1",
          "output": "tool"
        },
        "ref": {
          "x": 50,
          "y": 0,
          "a": 90
        },
        "home": {},
        "face": {
          "version": 1,
          "childPart": "frame",
          "rotation": [
            [
              1.8369701987210297e-16,
              -1,
              0
            ],
            [
              0,
              0,
              1
            ],
            [
              -1,
              -1.8369701987210297e-16,
              0
            ]
          ],
          "translation": {
            "x": 136.99999999999997,
            "y": 82.5,
            "z": 80
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
            "hostFace": "front",
            "childFace": "bottom",
            "alignU": 0,
            "alignV": 0,
            "offsetU": -60,
            "offsetV": 0,
            "gap": 0,
            "quarterTurns": 3
          },
          "hostThicknessMm": 4,
          "childThicknessMm": 3
        }
      },
      "mates": {
        "attach": {
          "normalDeg": 90
        },
        "receive": []
      },
      "faceParts": {
        "part": "frame",
        "face": "bottom"
      }
    }
  ],
  "motorAngles": {
    "2": 0
  },
  "tracePoints": [
    "LT",
    "RT"
  ]
};
