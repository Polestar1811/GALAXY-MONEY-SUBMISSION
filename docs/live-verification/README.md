# 真实接口验证记录（公开版说明）

原始记录（JSON：含同花顺扶摇接口返回的行情数据、request_id 与真实模型输出）保存在私有开发仓库中，**未放入公开仓库**：
扶摇数据的再分发权限未经确认。

各次真实验证的方法、数量与结论已写入：

- [测试报告](../TEST_REPORT.md)
- [Galaxy Money V2 测试报告](../GALAXY_MONEY_V2_TEST_REPORT.md)
- [AI 使用与验证记录](../AI_USAGE_LOG.md)

生成这些记录的脚本都在 `tests/live`、`tests/live-ui` 中，配置自己的密钥后可重新运行（见 README「真实验证」）。