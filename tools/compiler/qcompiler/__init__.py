"""Quackles canonical source compiler (RFC-001, issue #44).

One registered master -> every derivative (plates, DZI pyramids), each with a
recorded hash and parent. A verification gate refuses promotion when a plate is
not a downsample of its master, when pyramid levels do not nest, or when two
source families would be mixed for one theme.
"""
