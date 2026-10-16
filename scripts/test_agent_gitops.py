"""Real disposable Git fixtures; no real branch mutation in tests."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('agent_gitops.py')

class GitOpsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR'))
        self.root = Path(self.tmp.name) / 'repo'
        self.root.mkdir()
        self.git('init', '-b', 'main')
        self.git('config', 'user.email', 'fixture@example.invalid')
        self.git('config', 'user.name', 'Fixture')
        (self.root / 'one').write_text('one')
        self.git('add', 'one')
        self.git('commit', '-m', 'initial')
        self.git('branch', 'feat/example')
        self.git('update-ref', 'refs/remotes/origin/main', 'HEAD')
        self.git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main')
        self.git('worktree', 'add', '--detach', str(Path(self.tmp.name) / 'control'), 'HEAD')
    def tearDown(self):
        self.tmp.cleanup()
    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.root), *args], text=True, stderr=subprocess.DEVNULL).strip()
    def cli(self, *args):
        return subprocess.run([sys.executable, str(SCRIPT), '--root', str(self.root), *args], text=True, capture_output=True)
    def test_snapshot_covers_refs_and_detached_worktrees_without_paths(self):
        result = self.cli('snapshot', '--base', 'main', '--target', 'main')
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads((self.root / '.agents/branches.json').read_text())
        self.assertEqual({b['ref'] for b in data['branches']}, {'refs/heads/main', 'refs/heads/feat/example', 'refs/remotes/origin/main', 'refs/remotes/origin/HEAD'})
        self.assertEqual(len(data['worktrees']), 2)
        example = next(b for b in data['branches'] if b['ref'] == 'refs/heads/feat/example')
        self.assertEqual(example['purpose'], 'Tip intent: initial')
        self.assertEqual(example['merge_base_sha'], self.git('rev-parse', 'main'))
        self.assertTrue(example['preview_slot'], 'integrated local feature keeps a stable preview identity')
        self.assertNotIn(self.tmp.name, json.dumps(data))
        self.assertEqual(self.cli('check', '--live').returncode, 0)
        self.assertIn('feat/example', (self.root / 'BRANCHES.md').read_text())

    def test_rejects_registry_schema_and_live_drift(self):
        self.assertEqual(self.cli('snapshot', '--base', 'main', '--target', 'main').returncode, 0)
        path = self.root / '.agents/branches.json'
        data = json.loads(path.read_text())
        data['branches'][0]['head'] = 'not-a-sha'
        path.write_text(json.dumps(data))
        self.cli('render')
        self.assertNotEqual(self.cli('check').returncode, 0, 'invalid SHA accepted')
        self.cli('snapshot', '--base', 'main', '--target', 'main')
        self.git('branch', 'feat/new')
        self.assertNotEqual(self.cli('check', '--live').returncode, 0)
        self.assertEqual(self.cli('check').returncode, 0, 'portable CI must not depend on host refs')

    def test_branch_lease_is_shared_and_never_stolen(self):
        lease = SCRIPT.with_name('branch_lease.py')
        def run(root, *args):
            return subprocess.run([sys.executable, str(lease), '--root', str(root), *args], text=True, capture_output=True)
        first = run(self.root, 'claim', 'feat/example', '--owner', 'lane-a', '--scope', 'test fixture')
        self.assertEqual(first.returncode, 0, first.stderr)
        token = json.loads(first.stdout)['lease_id']
        other = Path(self.tmp.name) / 'control'
        self.assertNotEqual(run(other, 'claim', 'feat/example', '--owner', 'lane-b', '--scope', 'collision').returncode, 0)
        self.assertNotEqual(run(other, 'release', 'feat/example', '--lease-id', 'wrong').returncode, 0)
        self.assertEqual(run(other, 'renew', 'feat/example', '--lease-id', token).returncode, 0)
        self.assertEqual(run(other, 'release', 'feat/example', '--lease-id', token).returncode, 0)
        self.assertEqual(run(other, 'claim', 'feat/example', '--owner', 'lane-b', '--scope', 'next').returncode, 0)

    def test_live_check_rejects_checkout_binding_drift(self):
        self.cli('snapshot', '--base', 'main', '--target', 'main')
        self.git('checkout', 'feat/example')
        self.assertNotEqual(self.cli('check', '--live').returncode, 0)

    def test_metrics_measure_merge_lead_time_not_branch_creation(self):
        env = {**os.environ, 'GIT_AUTHOR_DATE': '2026-01-01T01:00:00Z', 'GIT_COMMITTER_DATE': '2026-01-01T01:00:00Z'}
        self.git('checkout', 'feat/example')
        (self.root / 'two').write_text('two')
        self.git('add', 'two')
        subprocess.run(['git', '-C', str(self.root), 'commit', '-m', 'fix: fixture'], env=env, check=True, capture_output=True)
        self.git('checkout', 'main')
        env.update(GIT_AUTHOR_DATE='2026-01-01T03:00:00Z', GIT_COMMITTER_DATE='2026-01-01T03:00:00Z')
        subprocess.run(['git', '-C', str(self.root), 'merge', '--no-ff', 'feat/example', '-m', 'merge fixture'], env=env, check=True, capture_output=True)
        result = subprocess.run([sys.executable, str(SCRIPT.with_name('gitops_metrics.py')), '--root', str(self.root)], text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertEqual(data['merge_count'], 1)
        self.assertEqual(data['lead_time_proxy_hours']['median'], 2.0)
        self.assertEqual(data['rework_subject_proxy_count'], 1)
        self.assertEqual(data['worktrees'], 2)

if __name__ == '__main__':
    unittest.main()
