config_change::
	jo -d . chart_color="#ff0000" | nats kv put config all

config_reset::
	nats kv del config all -f
