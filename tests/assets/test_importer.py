import sys
import struct
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from prepare_cs_assets import anim_value, quaternion, transform, triangle_indices, web_position, web_rotation, BASIS


class ImporterTests(unittest.TestCase):
    def test_animation_rle_handles_repeated_frames_and_next_run(self):
        data = struct.pack('<BBhhBBh', 2, 4, 10, 20, 1, 2, -30)
        self.assertEqual([anim_value(data, 0, i) for i in range(6)], [10, 20, 20, 20, -30, -30])

    def test_invalid_animation_run_is_rejected(self):
        with self.assertRaises(ValueError):
            anim_value(bytes([3, 2, 0, 0, 0, 0, 0, 0]), 0, 0)

    def test_strips_and_fans_preserve_triangle_winding(self):
        self.assertEqual(triangle_indices(5), [(0, 1, 2), (2, 1, 3), (2, 3, 4)])
        self.assertEqual(triangle_indices(-5), [(0, 1, 2), (0, 2, 3), (0, 3, 4)])

    def test_coordinate_conversion_preserves_bone_transforms(self):
        original = transform([16, 32, 64], quaternion([0.3, -0.2, 0.8]))
        converted = transform(web_position(np.array([16, 32, 64])), web_rotation(quaternion([0.3, -0.2, 0.8])))
        vertex = np.array([3, 7, 11, 1])
        expected = web_position((original @ vertex)[:3])
        actual = (converted @ np.r_[web_position(vertex[:3]), 1])[:3]
        np.testing.assert_allclose(actual, expected, atol=1e-7)
        self.assertAlmostEqual(np.linalg.det(BASIS), 1)


if __name__ == '__main__':
    unittest.main()
