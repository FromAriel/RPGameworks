# Decision 0004: Data-authored quests and save v2

The first quest needs to be playable without an NPC-specific script. Map-local dialogue graphs now select an ordered entry, show finite text and choices, and submit registered actions to the existing pure session transaction. The transaction owns item removal and the legal `inactive → active → completed` quest transition. The Journal reads those saved states; the Gallery light reads the same completion state through an authored object state. The archive clerk and ledger use the same path as Mara and the lens.

When an item was found before the quest offer, one explicit hand-in choice stages `active`, removes the item, then stages `completed` in a single transaction. Transition checks read the staged quest state, while inventory limits and prerequisites still gate the whole commit. A failed item removal leaves the quest inactive and the item unchanged. Declining or closing the offer commits nothing. Ordinary acceptance remains a separate transaction with a wrap-up; hand-in follows on a later conversation.

The global quest catalog contains stable IDs and Journal text. It is a small hashed content file; maps and their dialogue graphs remain independently loaded. Validation rejects broken strings, nodes, references, and action IDs before content is emitted. Content never executes JavaScript.

Save envelopes and the state index use version 2 when quests are present. A validated version-1 save for this game migrates in memory with an empty quest map, preserving its inventory, facts, placements, checkpoint, slot revision, and timestamp. Reading or loading does not overwrite the stored version-1 record. An explicit save writes version 2 and retains the prior record through the repository's existing previous-revision mechanism. A discovered plaque or carried lens therefore remains useful without silently accepting the quest.

This packet keeps dialogue actions synchronous and bounded by the existing transaction limits. It does not add a general script interpreter, timed dialogue yields, or mid-conversation save checkpoints. Those need their own content use case and continuation rules.
