config_change::
	jo -d . chart_color="#ff0000" | nats kv put config all

config_reset::
	nats kv del config all -f

mirrors:
	nats s add survey --mirror survey --defaults --js-domain leaf --context default
	nats kv add config --mirror config --mirror-domain ngs --js-domain leaf --context default
