// User-drawn three-bar linkage: syringe attached to the second end of Link13.
export const snapshot = {
  "kind": "blocks",
  "v": 1,
  "comps": [
    {
      "type": "bar",
      "id": "Link11",
      "color": "#3498db",
      "p1": {
        "id": "P11a",
        "type": "fixed",
        "x": -66.58135268636728,
        "y": -11.283468848025917
      },
      "p2": {
        "id": "P11b",
        "type": "fixed",
        "x": 4.447260612955461,
        "y": 104.69470191171351
      },
      "lenParam": "LL11",
      "isInput": false,
      "fixedLen": true
    },
    {
      "type": "bar",
      "id": "Link12",
      "color": "#3498db",
      "p1": {
        "id": "P11b",
        "type": "fixed",
        "x": 4.447260612955461,
        "y": 104.69470191171351
      },
      "p2": {
        "id": "P12b",
        "type": "floating",
        "x": 89.90094822432373,
        "y": 45.4185070809158
      },
      "lenParam": "LL12",
      "isInput": false,
      "fixedLen": true
    },
    {
      "type": "bar",
      "id": "Link13",
      "color": "#3498db",
      "p1": {
        "id": "P12b",
        "type": "floating",
        "x": 89.90094822432373,
        "y": 45.4185070809158
      },
      "p2": {
        "id": "P13b",
        "type": "floating",
        "x": 65.32580521382063,
        "y": 13.858051665739662
      },
      "lenParam": "LL13",
      "isInput": false,
      "fixedLen": true,
      "snapLength": false
    },
    {
      "type": "syringe",
      "id": "Syringe1",
      "mountMode": "fixed-axis",
      "appearance": "flat-rod",
      "axisDeg": 0,
      "outputId": "Link12",
      "a": {
        "componentId": "Link11",
        "u": 29.481813409140916,
        "v": 0
      },
      "b": {
        "componentId": "Link13",
        "u": 40,
        "v": 0
      },
      "spec": {
        "name": "F3D 外形參考／20 mm 教學區間（未實測）",
        "capacityMl": 10,
        "outerDiameter": 17.5,
        "bodyLength": 72,
        "rodDiameter": 8,
        "lmin": 105.90971434135955,
        "stroke": 20,
        "calibrated": false
      },
      "extension": 10.6,
      "branch": 1,
      "installation": {
        "face": "front",
        "spacerMm": null
      }
    }
  ],
  "params": {
    "theta": 0,
    "LL11": 136,
    "LL12": 104,
    "LL13": 40,
    "Syringe1_a1_len": 29.481813409140916,
    "Syringe1_a2_len": 106.51818659085909,
    "Syringe1_b1_len": 40,
    "Syringe1_b2_len": 8,
    "Syringe1_length": 116.50971434135954
  },
  "counter": 13
};
