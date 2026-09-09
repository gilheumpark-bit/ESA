from pathlib import Path
p=Path('.review-patches/apply-feedback.py');s=p.read_text()
old="replace(p,'voltageCompatibility(a, b, texts)','voltageCompatibility(a, b, texts, symbols)')"
assert s.count(old)==1
s=s.replace(old,"replace(p,'voltageCompatibility(a, b, texts)','voltageCompatibility(a, b, texts, symbols)',2)")
p.write_text(s)
print('Two baseline voltage call sites are intentionally updated; the old pair selector is then replaced.')
