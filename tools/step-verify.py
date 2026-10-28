#!/usr/bin/env python3
"""用 OpenCascade 檢查 .step：每個實體是否有效（BRepCheck）、實體數、體積、包圍盒。
不屬於 node 測試；需要 pip install cadquery-ocp（或 ocp）。
用法：python3 -I tools/step-verify.py a.step [b.step ...] [--expect-volume 5951.75] [--names]
結束碼：0 全部有效；1 有無效實體或讀檔失敗。
"""
import sys

try:
    from OCP.STEPControl import STEPControl_Reader
    from OCP.STEPCAFControl import STEPCAFControl_Reader
    from OCP.IFSelect import IFSelect_RetDone
    from OCP.TopAbs import TopAbs_SOLID, TopAbs_SHELL, TopAbs_FACE
    from OCP.TopExp import TopExp_Explorer
    from OCP.BRepCheck import BRepCheck_Analyzer
    from OCP.GProp import GProp_GProps
    from OCP.BRepGProp import BRepGProp
    from OCP.Bnd import Bnd_Box
    from OCP.BRepBndLib import BRepBndLib
    from OCP.TopoDS import TopoDS
    from OCP.BRepAdaptor import BRepAdaptor_Surface
    from OCP.GeomAbs import GeomAbs_Plane, GeomAbs_Cylinder
except ImportError as e:  # pragma: no cover
    sys.exit("找不到 OpenCascade Python 綁定（pip install cadquery-ocp --break-system-packages）：%s" % e)


def st(cls, name):
    """靜態方法：舊版 OCP 叫 name_s，新版就叫 name。"""
    return getattr(cls, name + "_s", None) or getattr(cls, name)


def explore(shape, kind):
    ex = TopExp_Explorer(shape, kind)
    while ex.More():
        yield ex.Current()
        ex.Next()


def bbox(shape):
    box = Bnd_Box()
    st(BRepBndLib, "AddOptimal")(shape, box, False, False)
    if hasattr(box, "CornerMin"):
        a, b = box.CornerMin(), box.CornerMax()
        return (a.X(), a.Y(), a.Z(), b.X(), b.Y(), b.Z())
    return box.Get()


def check(path, expect_volume=None):
    reader = STEPControl_Reader()
    if reader.ReadFile(path) != IFSelect_RetDone:
        print("FAIL 讀不進來:", path)
        return False
    reader.TransferRoots()
    shape = reader.OneShape()
    solids = [st(TopoDS, "Solid")(s) for s in explore(shape, TopAbs_SOLID)]
    all_valid = True
    total = 0.0
    boxes = []
    planes = cyls = 0
    for s in solids:
        props = GProp_GProps()
        st(BRepGProp, "VolumeProperties")(s, props)
        total += props.Mass()
        boxes.append(bbox(s))
        for f in explore(s, TopAbs_FACE):
            t = BRepAdaptor_Surface(st(TopoDS, "Face")(f)).GetType()
            planes += t == GeomAbs_Plane
            cyls += t == GeomAbs_Cylinder
        if not BRepCheck_Analyzer(s).IsValid():
            all_valid = False
    invalid = sum(1 for s in solids if not BRepCheck_Analyzer(s).IsValid())
    print("%s" % path)
    print("  實體 %d 個，無效 %d 個；面：平面 %d、圓柱 %d" % (len(solids), invalid, planes, cyls))
    print("  總體積 %.3f mm^3" % total)
    if boxes:
        lo = [min(b[i] for b in boxes) for i in range(3)]
        hi = [max(b[i + 3] for b in boxes) for i in range(3)]
        print("  包圍盒 x[%.3f, %.3f] y[%.3f, %.3f] z[%.3f, %.3f]" % (lo[0], hi[0], lo[1], hi[1], lo[2], hi[2]))
    ok = all_valid and len(solids) > 0 and total > 0
    if expect_volume is not None:
        close = abs(total - expect_volume) <= max(0.01, expect_volume * 1e-4)
        print("  預期體積 %.3f：%s" % (expect_volume, "吻合" if close else "不吻合"))
        ok = ok and close
    return ok


def names(path):
    """用 XCAF 讀組立結構：列出組立／零件名稱（確認中文名稱與組立樹）。"""
    from OCP.TDocStd import TDocStd_Document
    from OCP.TCollection import TCollection_ExtendedString
    from OCP.XCAFDoc import XCAFDoc_DocumentTool, XCAFDoc_ShapeTool
    from OCP.TDataStd import TDataStd_Name
    from OCP.TDF import TDF_Label
    try:
        from OCP.collections import Sequence_TDF_Label as LabelSeq
    except ImportError:
        from OCP.TDF import TDF_LabelSequence as LabelSeq
    doc = TDocStd_Document(TCollection_ExtendedString("doc"))
    rd = STEPCAFControl_Reader()
    rd.SetNameMode(True)
    if rd.ReadFile(path) != IFSelect_RetDone or not rd.Transfer(doc):
        print("  (XCAF 讀不進來)")
        return
    tool = st(XCAFDoc_DocumentTool, "ShapeTool")(doc.Main())

    def label_name(lab):
        n = TDataStd_Name()
        return n.Get().ToExtString() if lab.FindAttribute(st(TDataStd_Name, "GetID")(), n) else "?"

    def walk(lab, depth):
        target = TDF_Label()
        if st(XCAFDoc_ShapeTool, "IsReference")(lab):
            st(XCAFDoc_ShapeTool, "GetReferredShape")(lab, target)
        else:
            target = lab
        out.append("%s%s" % ("  " * depth, label_name(target)))
        comps = LabelSeq()
        st(XCAFDoc_ShapeTool, "GetComponents")(target, comps)
        for i in range(1, comps.Length() + 1):
            walk(comps.Value(i), depth + 1)

    out = []
    roots = LabelSeq()
    tool.GetFreeShapes(roots)
    for i in range(1, roots.Length() + 1):
        walk(roots.Value(i), 0)
    print("  組立樹（%d 個頂層）：" % roots.Length())
    for line in out:
        print("   ", line)


def main(argv):
    files, expect, show_names = [], None, False
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--expect-volume":
            expect = float(argv[i + 1]); i += 1
        elif a == "--names":
            show_names = True
        else:
            files.append(a)
        i += 1
    if not files:
        sys.exit(__doc__)
    ok = True
    for f in files:
        ok = check(f, expect) and ok
        if show_names:
            names(f)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main(sys.argv[1:])
