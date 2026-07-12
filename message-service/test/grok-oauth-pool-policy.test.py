import importlib.util
import unittest
from pathlib import Path
from types import SimpleNamespace


MODULE_PATH = Path(__file__).parents[1] / "deploy" / "grok_oauth_pool_policy.py"


def load_policy():
    spec = importlib.util.spec_from_file_location("grok_oauth_pool_policy", MODULE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Grok OAuth pool policy could not be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakePool:
    def __init__(self, entries):
        self._entries = entries

    def entries(self):
        return self._entries


def entry(priority, status="ready"):
    return SimpleNamespace(priority=priority, last_status=status)


class GrokOAuthPoolPolicyTest(unittest.TestCase):
    def test_orders_every_credential_instead_of_only_the_latest_three(self):
        policy = load_policy()
        pool = FakePool([entry(priority) for priority in range(13, 0, -1)])

        result = policy.ordered_pool_entries(pool)

        self.assertEqual([item.priority for item in result], list(range(1, 14)))
        self.assertEqual(policy.pool_attempt_count(pool), 13)

    def test_prefers_non_exhausted_credentials_across_the_full_pool(self):
        policy = load_policy()
        usable = entry(1)
        pool = FakePool([usable, entry(11, "exhausted"), entry(12, "exhausted"), entry(13, "exhausted")])

        self.assertEqual(policy.active_pool_entries(pool), [usable])

    def test_all_exhausted_entries_remain_retryable_after_provider_cooldown(self):
        policy = load_policy()
        exhausted = [entry(1, "exhausted"), entry(2, "exhausted")]

        self.assertEqual(policy.active_pool_entries(FakePool(exhausted)), exhausted)


if __name__ == "__main__":
    unittest.main()
