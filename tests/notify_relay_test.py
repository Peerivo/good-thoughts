import importlib.util
import unittest

spec=importlib.util.spec_from_file_location('relay','scripts/owner_notify_relay.py')
relay=importlib.util.module_from_spec(spec)
spec.loader.exec_module(relay)

class RelayTest(unittest.TestCase):
    def test_notice_is_private_scope_and_metadata_only(self):
        event={'id':'e70c2f20-f18b-4f32-96ce-f088eef25451','kind':'new_question'}
        title,body=relay.notice_text(event)
        self.assertTrue(title.startswith('[notify:telegram]'))
        self.assertIn('dm-notice:',title)
        self.assertNotIn('test@example.com',title+body)
        self.assertIn('без явного решения',body)
    def test_draft_marker_is_stable(self):
        event={'id':'e70c2f20-f18b-4f32-96ce-f088eef25451','kind':'draft_v2'}
        self.assertIn('черновик',relay.notice_text(event)[0])

if __name__=='__main__':
    unittest.main()
